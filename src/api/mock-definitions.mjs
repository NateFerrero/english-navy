const WORDS_KEY = "mock:words";
const DEFINITIONS_KEY = "mock:definitions";
const PICKS_KEY = "mock:picks";
const MESSAGES_KEY = "mock:sam-messages";
const RESOLUTIONS_KEY = "mock:thread-resolutions";
const AGREEMENTS_KEY = "mock:thread-agreements";
const HISTORY_KEY = "mock:definition-history";
const NOTICES_KEY = "mock:user-notifications";
const INACTIVITY_MS = 30 * 24 * 60 * 60 * 1000;

function load(key) {
  try {
    return JSON.parse(sessionStorage.getItem(key)) || [];
  } catch {
    return [];
  }
}

function save(key, value) {
  sessionStorage.setItem(key, JSON.stringify(value));
}

function fail(message, code) {
  const err = new Error(message);
  err.code = code;
  throw err;
}

function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function keyOf(value) {
  return String(value || "").trim().toLowerCase();
}

function actorLabel(user) {
  return String(user.profile?.display_name || user.email.split("@")[0]);
}

function currentDefinitionsFrom(definitions) {
  if (!definitions.length) return [];
  const max = Math.max(...definitions.map((item) => Number(item.pickCount || 0)));
  return definitions.filter((item) => Number(item.pickCount || 0) === max);
}

function isActive(user, now) {
  const last = user.lastSeenAt || user.createdAt;
  if (!last) return false;
  return now.getTime() - new Date(last).getTime() < INACTIVITY_MS;
}

export function createMockDefinitionApi({ delay, requireCurrentUser, loadUsers, loadRealms, recordLogEntry }) {
  function requireRealm(user, realmId) {
    const realm = loadRealms().find((item) => item.id === realmId && item.members.some((member) => member.userId === user.id));
    if (!realm) fail("Realm not found.", "REALM_NOT_FOUND");
    const member = realm.members.find((item) => item.userId === user.id);
    return {
      realm: {
        id: realm.id,
        title: realm.title,
        description: realm.description || "",
        role: member?.role || "member",
        memberCount: realm.members.length,
      },
      raw: realm,
    };
  }

  function touch(user) {
    const users = loadUsers();
    const row = users.find((item) => item.id === user.id);
    if (row) {
      row.lastSeenAt = new Date().toISOString();
      sessionStorage.setItem("mock:users", JSON.stringify(users));
    }
  }

  function notify({ userId, realmId, eventType, body, metadata }) {
    const notices = load(NOTICES_KEY);
    notices.unshift({
      id: newId("ntf"),
      userId,
      realmId,
      eventType,
      body,
      metadata: metadata || null,
      read: false,
      createdAt: new Date().toISOString(),
    });
    save(NOTICES_KEY, notices);
  }

  function history({ wordId, eventType, definitionId, actorUserId, metadata }) {
    const events = load(HISTORY_KEY);
    events.unshift({
      id: newId("his"),
      wordId,
      eventType,
      definitionId: definitionId || null,
      actorUserId,
      metadata: metadata || {},
      createdAt: new Date().toISOString(),
    });
    save(HISTORY_KEY, events);
  }

  function decorateWord(word, userId) {
    const definitions = load(DEFINITIONS_KEY)
      .filter((item) => item.wordId === word.id)
      .map((item) => ({
        ...item,
        pickCount: load(PICKS_KEY).filter((pick) => pick.definitionId === item.id).length,
      }));
    const current = currentDefinitionsFrom(definitions);
    const currentIds = new Set(current.map((item) => item.id));
    for (const definition of definitions) definition.current = currentIds.has(definition.id);
    const myPickId = load(PICKS_KEY).find((pick) => pick.wordId === word.id && pick.userId === userId)?.definitionId || null;
    return {
      word: { id: word.id, name: word.name, clarifier: word.clarifier, createdByUserId: word.createdByUserId, createdAt: word.createdAt },
      definitions,
      currentDefinitions: current,
      alternativeDefinitions: definitions.filter((item) => !item.current),
      myPickId,
    };
  }

  function wordOrThrow(wordId) {
    const word = load(WORDS_KEY).find((item) => item.id === wordId);
    if (!word) fail("Word not found.", "WORD_NOT_FOUND");
    return word;
  }

  function publicRealmPayload(realm, extra) {
    return { realm, ...extra };
  }

  return {
    async markNotificationsRead({ ids = [] } = {}) {
      await delay(60);
      const user = requireCurrentUser();
      const notices = load(NOTICES_KEY);
      for (const notice of notices) {
        if (notice.userId === user.id && (!ids.length || ids.includes(notice.id))) notice.read = true;
      }
      save(NOTICES_KEY, notices);
      return { ok: true };
    },

    async listRealmWords({ realmId }) {
      await delay(120);
      const user = requireCurrentUser();
      touch(user);
      const { realm } = requireRealm(user, realmId);
      const words = load(WORDS_KEY)
        .filter((item) => item.realmId === realmId)
        .map((word) => {
          const bundle = decorateWord(word, user.id);
          return {
            ...bundle.word,
            currentDefinitions: bundle.currentDefinitions,
            previewBody: bundle.currentDefinitions[0]?.body || "",
            myPickId: bundle.myPickId,
          };
        });
      return publicRealmPayload(realm, { words });
    },

    async getRealmWord({ realmId, wordId }) {
      await delay(100);
      const user = requireCurrentUser();
      touch(user);
      const { realm } = requireRealm(user, realmId);
      return publicRealmPayload(realm, decorateWord(wordOrThrow(wordId), user.id));
    },

    async getRealmDefinition({ realmId, definitionId }) {
      await delay(120);
      const user = requireCurrentUser();
      touch(user);
      const { realm, raw } = requireRealm(user, realmId);
      const definition = load(DEFINITIONS_KEY).find((item) => item.id === definitionId);
      if (!definition) fail("Definition not found.", "DEFINITION_NOT_FOUND");
      const word = wordOrThrow(definition.wordId);
      const bundle = decorateWord(word, user.id);
      const now = new Date();
      const users = loadUsers();
      const live = load(MESSAGES_KEY).filter((item) => item.definitionId === definitionId && !item.collapsed);
      const messages = live.map((item) => {
        const author = users.find((row) => row.id === item.authorUserId);
        return {
          ...item,
          authorEmail: author?.email || null,
          authorName: author ? actorLabel(author) : "Unknown",
          isSideThreadRoot: Boolean(item.threadId && item.threadId === item.id),
        };
      });
      const resolutions = {};
      for (const threadId of new Set(live.map((item) => item.threadId).filter(Boolean))) {
        const resolution = load(RESOLUTIONS_KEY).find((item) => item.threadId === threadId) || {
          threadId,
          status: "none",
          consensusBody: "",
          agreements: [],
        };
        const participantIds = [...new Set(live.filter((item) => item.threadId === threadId).map((item) => item.authorUserId))];
        const activeIds = participantIds.filter((id) => {
          const row = users.find((item) => item.id === id);
          return row && raw.members.some((member) => member.userId === id) && isActive(row, now);
        });
        const agreements = load(AGREEMENTS_KEY).filter((item) => item.threadId === threadId);
        const agreedIds = new Set(agreements.filter((item) => item.agreed).map((item) => item.userId));
        resolutions[threadId] = {
          ...resolution,
          agreements,
          participantIds,
          activeIds,
          missingIds: activeIds.filter((id) => !agreedIds.has(id)),
          canResolve: activeIds.includes(user.id),
        };
      }
      return publicRealmPayload(realm, {
        ...bundle,
        definition: bundle.definitions.find((item) => item.id === definitionId),
        messages,
        resolutions,
      });
    },

    async listWordHistory({ realmId, wordId }) {
      await delay(80);
      const user = requireCurrentUser();
      const { realm } = requireRealm(user, realmId);
      const word = wordOrThrow(wordId);
      const users = loadUsers();
      const events = load(HISTORY_KEY)
        .filter((item) => item.wordId === wordId)
        .map((event) => {
          const actor = users.find((item) => item.id === event.actorUserId);
          return {
            ...event,
            actorEmail: actor?.email || null,
            actorName: actor ? actorLabel(actor) : null,
          };
        });
      return publicRealmPayload(realm, { word: { id: word.id, name: word.name, clarifier: word.clarifier }, events });
    },

    async getHistoryEvent({ realmId, eventId }) {
      await delay(60);
      const user = requireCurrentUser();
      const { realm } = requireRealm(user, realmId);
      const event = load(HISTORY_KEY).find((item) => item.id === eventId);
      if (!event) fail("History entry not found.", "HISTORY_NOT_FOUND");
      const word = load(WORDS_KEY).find((item) => item.id === event.wordId);
      return publicRealmPayload(realm, {
        word: word ? { id: word.id, name: word.name, clarifier: word.clarifier } : null,
        event,
        readable: {
          name: event.metadata?.name || word?.name || "",
          clarifier: event.metadata?.clarifier || word?.clarifier || "",
          body: event.metadata?.snapshot || event.metadata?.body || "",
        },
      });
    },

    async createWord({ realmId, name, clarifier, definition }) {
      await delay(150);
      const user = requireCurrentUser();
      touch(user);
      const { realm } = requireRealm(user, realmId);
      const cleanName = String(name || "").trim();
      const cleanClarifier = String(clarifier || "").trim() || "General";
      const body = String(definition || "").trim();
      if (!cleanName) fail("Enter a word or phrase.", "NAME_REQUIRED");
      if (!body) fail("Enter a definition.", "DEFINITION_REQUIRED");
      const words = load(WORDS_KEY);
      if (words.some((item) => item.realmId === realmId && keyOf(item.name) === keyOf(cleanName) && keyOf(item.clarifier) === keyOf(cleanClarifier))) {
        fail("That word already exists with this clarifier.", "WORD_EXISTS");
      }
      const word = {
        id: newId("wrd"),
        realmId,
        name: cleanName,
        clarifier: cleanClarifier,
        createdByUserId: user.id,
        createdAt: new Date().toISOString(),
      };
      const def = {
        id: newId("def"),
        wordId: word.id,
        body,
        forkedFromId: null,
        createdByUserId: user.id,
        createdAt: word.createdAt,
      };
      words.unshift(word);
      save(WORDS_KEY, words);
      const definitions = load(DEFINITIONS_KEY);
      definitions.unshift(def);
      save(DEFINITIONS_KEY, definitions);
      const picks = load(PICKS_KEY);
      picks.push({ wordId: word.id, userId: user.id, definitionId: def.id, updatedAt: word.createdAt });
      save(PICKS_KEY, picks);
      history({ wordId: word.id, eventType: "word_created", definitionId: def.id, actorUserId: user.id, metadata: { name: cleanName, clarifier: cleanClarifier, body, snapshot: body } });
      recordLogEntry({ ownerUserId: user.id, type: "word_created", metadata: { realmId, wordId: word.id, name: cleanName } });
      return publicRealmPayload(realm, decorateWord(word, user.id));
    },

    async createDefinition({ realmId, wordId, body }) {
      await delay(120);
      const user = requireCurrentUser();
      const { realm } = requireRealm(user, realmId);
      const word = wordOrThrow(wordId);
      const cleanBody = String(body || "").trim();
      if (!cleanBody) fail("Enter a definition.", "DEFINITION_REQUIRED");
      const def = {
        id: newId("def"),
        wordId,
        body: cleanBody,
        forkedFromId: null,
        createdByUserId: user.id,
        createdAt: new Date().toISOString(),
      };
      const definitions = load(DEFINITIONS_KEY);
      definitions.unshift(def);
      save(DEFINITIONS_KEY, definitions);
      history({ wordId, eventType: "definition_created", definitionId: def.id, actorUserId: user.id, metadata: { name: word.name, clarifier: word.clarifier, body: cleanBody, snapshot: cleanBody } });
      return publicRealmPayload(realm, decorateWord(word, user.id));
    },

    async forkDefinition({ realmId, definitionId, body }) {
      await delay(140);
      const user = requireCurrentUser();
      const { realm } = requireRealm(user, realmId);
      const source = load(DEFINITIONS_KEY).find((item) => item.id === definitionId);
      if (!source) fail("Definition not found.", "DEFINITION_NOT_FOUND");
      const word = wordOrThrow(source.wordId);
      const cleanBody = String(body == null || body === "" ? source.body : body).trim();
      const def = {
        id: newId("def"),
        wordId: source.wordId,
        body: cleanBody,
        forkedFromId: source.id,
        createdByUserId: user.id,
        createdAt: new Date().toISOString(),
      };
      const definitions = load(DEFINITIONS_KEY);
      definitions.unshift(def);
      save(DEFINITIONS_KEY, definitions);
      history({
        wordId: word.id,
        eventType: "definition_forked",
        definitionId: def.id,
        actorUserId: user.id,
        metadata: { name: word.name, clarifier: word.clarifier, body: cleanBody, snapshot: cleanBody, forkedFromId: source.id },
      });
      if (source.createdByUserId !== user.id) {
        notify({
          userId: source.createdByUserId,
          realmId,
          eventType: "definition_forked",
          body: `${actorLabel(user)} forked your definition for ${word.name} (${word.clarifier}).`,
          metadata: { wordId: word.id, definitionId: def.id, forkedFromId: source.id },
        });
      }
      return publicRealmPayload(realm, decorateWord(word, user.id));
    },

    async pickDefinition({ realmId, wordId, definitionId }) {
      await delay(80);
      const user = requireCurrentUser();
      const { realm } = requireRealm(user, realmId);
      const word = wordOrThrow(wordId);
      const before = decorateWord(word, user.id);
      if (!before.definitions.some((item) => item.id === definitionId)) fail("Definition not found.", "DEFINITION_NOT_FOUND");
      const picks = load(PICKS_KEY);
      const existing = picks.find((item) => item.wordId === wordId && item.userId === user.id);
      if (existing) existing.definitionId = definitionId;
      else picks.push({ wordId, userId: user.id, definitionId, updatedAt: new Date().toISOString() });
      save(PICKS_KEY, picks);
      const after = decorateWord(word, user.id);
      history({ wordId, eventType: "pick_changed", definitionId, actorUserId: user.id, metadata: { name: word.name, clarifier: word.clarifier, snapshot: after.definitions.find((item) => item.id === definitionId)?.body } });
      if (before.currentDefinitions.map((item) => item.id).sort().join(",") !== after.currentDefinitions.map((item) => item.id).sort().join(",")) {
        history({
          wordId,
          eventType: "consensus_changed",
          definitionId,
          actorUserId: user.id,
          metadata: { name: word.name, clarifier: word.clarifier, snapshot: after.currentDefinitions.map((item) => item.body).join("\n\n") },
        });
      }
      if (after.currentDefinitions.length > 1 && before.currentDefinitions.length <= 1) {
        const authors = new Set(after.currentDefinitions.map((item) => item.createdByUserId).filter((id) => id !== user.id));
        for (const userId of authors) {
          notify({
            userId,
            realmId,
            eventType: "definition_tied",
            body: `Your definition is now tied for the Current Definition for ${word.name} (${word.clarifier}).`,
            metadata: { wordId, name: word.name, clarifier: word.clarifier },
          });
        }
      }
      return publicRealmPayload(realm, after);
    },

    async addArgument({ realmId, definitionId, body }) {
      await delay(80);
      const user = requireCurrentUser();
      requireRealm(user, realmId);
      if (!String(body || "").trim()) fail("Message cannot be empty.", "EMPTY_MESSAGE");
      const messages = load(MESSAGES_KEY);
      const id = newId("sam");
      messages.push({
        id,
        definitionId,
        parentId: null,
        threadId: null,
        body: String(body).trim(),
        authorUserId: user.id,
        kind: "argument",
        collapsed: false,
        collapsedIntoId: null,
        createdAt: new Date().toISOString(),
      });
      save(MESSAGES_KEY, messages);
      return { id };
    },

    async startBranch({ realmId, parentId, body }) {
      await delay(80);
      const user = requireCurrentUser();
      requireRealm(user, realmId);
      const messages = load(MESSAGES_KEY);
      const parent = messages.find((item) => item.id === parentId && !item.collapsed);
      if (!parent) fail("Message not found.", "MESSAGE_NOT_FOUND");
      if (!String(body || "").trim()) fail("Message cannot be empty.", "EMPTY_MESSAGE");
      const id = newId("sam");
      messages.push({
        id,
        definitionId: parent.definitionId,
        parentId: parent.id,
        threadId: id,
        body: String(body).trim(),
        authorUserId: user.id,
        kind: "argument",
        collapsed: false,
        collapsedIntoId: null,
        createdAt: new Date().toISOString(),
      });
      save(MESSAGES_KEY, messages);
      return { id, threadId: id };
    },

    async replyInThread({ realmId, parentId, body }) {
      await delay(80);
      const user = requireCurrentUser();
      requireRealm(user, realmId);
      const messages = load(MESSAGES_KEY);
      const parent = messages.find((item) => item.id === parentId && !item.collapsed);
      if (!parent) fail("Message not found.", "MESSAGE_NOT_FOUND");
      if (!parent.threadId) fail("Only side threads can be resolved.", "NOT_SIDE_THREAD");
      if (!String(body || "").trim()) fail("Message cannot be empty.", "EMPTY_MESSAGE");
      const id = newId("sam");
      messages.push({
        id,
        definitionId: parent.definitionId,
        parentId: parent.id,
        threadId: parent.threadId,
        body: String(body).trim(),
        authorUserId: user.id,
        kind: "argument",
        collapsed: false,
        collapsedIntoId: null,
        createdAt: new Date().toISOString(),
      });
      save(MESSAGES_KEY, messages);
      return { id, threadId: parent.threadId };
    },

    async proposeResolution({ realmId, threadId, body }) {
      await delay(100);
      const user = requireCurrentUser();
      const { raw } = requireRealm(user, realmId);
      const cleanBody = String(body || "").trim();
      if (!cleanBody) fail("Message cannot be empty.", "EMPTY_MESSAGE");
      collapseIfReady({ user, realmId, raw, threadId, replace: { proposedByUserId: user.id, consensusBody: cleanBody, status: "pending" } });
      return { ok: true };
    },

    async agreeResolution({ realmId, threadId }) {
      await delay(80);
      const user = requireCurrentUser();
      const { raw } = requireRealm(user, realmId);
      collapseIfReady({ user, realmId, raw, threadId, agree: true });
      return { ok: true };
    },
  };

  function collapseIfReady({ user, realmId, raw, threadId, replace, agree }) {
    const messages = load(MESSAGES_KEY);
    const root = messages.find((item) => item.id === threadId);
    if (!root || root.threadId !== root.id) fail("Only side threads can be resolved.", "NOT_SIDE_THREAD");
    if (root.collapsed) fail("That thread has already been resolved.", "THREAD_COLLAPSED");
    const now = new Date();
    const users = loadUsers();
    const live = messages.filter((item) => item.threadId === threadId && !item.collapsed);
    const participantIds = [...new Set(live.map((item) => item.authorUserId))];
    const activeIds = participantIds.filter((id) => {
      const row = users.find((item) => item.id === id);
      return row && raw.members.some((member) => member.userId === id) && isActive(row, now);
    });
    if (!activeIds.includes(user.id)) fail("Only active participants can resolve this thread.", "NOT_PARTICIPANT");

    let resolutions = load(RESOLUTIONS_KEY);
    if (replace) {
      resolutions = resolutions.filter((item) => item.threadId !== threadId);
      resolutions.push({ threadId, ...replace, createdAt: now.toISOString(), resolvedAt: null });
      save(RESOLUTIONS_KEY, resolutions);
      save(
        AGREEMENTS_KEY,
        load(AGREEMENTS_KEY)
          .filter((item) => item.threadId !== threadId)
          .concat([{ threadId, userId: user.id, agreed: true, updatedAt: now.toISOString() }])
      );
    } else if (agree) {
      const current = resolutions.find((item) => item.threadId === threadId && item.status === "pending");
      if (!current) fail("No consensus message has been proposed yet.", "NO_PROPOSAL");
      const agreements = load(AGREEMENTS_KEY).filter((item) => item.threadId !== threadId);
      const existing = load(AGREEMENTS_KEY).filter((item) => item.threadId === threadId);
      const mine = existing.find((item) => item.userId === user.id) || { threadId, userId: user.id };
      mine.agreed = true;
      mine.updatedAt = now.toISOString();
      save(AGREEMENTS_KEY, agreements.concat(existing.filter((item) => item.userId !== user.id), [mine]));
    }

    const resolution = load(RESOLUTIONS_KEY).find((item) => item.threadId === threadId);
    const agreedIds = new Set(load(AGREEMENTS_KEY).filter((item) => item.threadId === threadId && item.agreed).map((item) => item.userId));
    if (!resolution || resolution.status !== "pending" || !activeIds.length || !activeIds.every((id) => agreedIds.has(id))) return;

    const parent = messages.find((item) => item.id === root.parentId);
    const consensusId = newId("sam");
    const descendants = new Set();
    const stack = [threadId];
    while (stack.length) {
      const id = stack.pop();
      if (descendants.has(id)) continue;
      descendants.add(id);
      for (const child of messages.filter((item) => item.parentId === id)) stack.push(child.id);
    }
    for (const message of messages) {
      if (descendants.has(message.id)) {
        message.collapsed = true;
        message.collapsedIntoId = consensusId;
      }
    }
    messages.push({
      id: consensusId,
      definitionId: root.definitionId,
      parentId: root.parentId,
      threadId: parent?.threadId || null,
      body: resolution.consensusBody,
      authorUserId: user.id,
      kind: "consensus",
      collapsed: false,
      collapsedIntoId: null,
      createdAt: now.toISOString(),
    });
    save(MESSAGES_KEY, messages);
    resolution.status = "resolved";
    resolution.resolvedAt = now.toISOString();
    save(RESOLUTIONS_KEY, load(RESOLUTIONS_KEY).map((item) => (item.threadId === threadId ? resolution : item)));
    const word = load(WORDS_KEY).find((item) => item.id === load(DEFINITIONS_KEY).find((def) => def.id === root.definitionId)?.wordId);
    history({
      wordId: word?.id,
      eventType: "thread_collapsed",
      definitionId: root.definitionId,
      actorUserId: user.id,
      metadata: { name: word?.name, clarifier: word?.clarifier, snapshot: resolution.consensusBody, threadId, consensusId },
    });
    for (const userId of new Set([...descendants].map((id) => messages.find((item) => item.id === id)?.authorUserId).filter((id) => id && id !== user.id))) {
      notify({
        userId,
        realmId,
        eventType: "thread_collapsed",
        body: "A thread you participated in has been resolved and collapsed.",
        metadata: { wordId: word?.id, definitionId: root.definitionId, threadId, consensusId },
      });
    }
  }
}

export function mockNoticesFor(userId) {
  return load(NOTICES_KEY).filter((item) => item.userId === userId);
}
