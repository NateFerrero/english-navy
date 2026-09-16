// In-browser mock API.
//
// Simulates a backend using sessionStorage as the "database" and a small
// artificial delay so the UI exercises its loading/async states. No network,
// no external dependencies.

import { clearSession, TOKEN_KEY } from "../session.mjs";

const USERS_KEY = "mock:users";
const INVITE_CODES_KEY = "mock:invite-codes";
const LOG_KEY = "mock:activity-log";
const CONTACTS_KEY = "mock:contacts";
const REALMS_KEY = "mock:realms";
const REALM_INVITATIONS_KEY = "mock:realm-invitations";
const MAX_INVITE_CODES_PER_USER = 100;
const DEMO_INVITE_CODE = "DEMO-CODE-0001";
const INVITE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PAGE_RANK_PATHS = new Set(["/", "/profile", "/settings", "/log", "/realms", "/contacts"]);
const DEFAULT_PROFILE = {
  display_name: "",
  first_name: "",
  last_name: "",
  bio: "",
  default_timezone: "UTC",
};

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadUsers() {
  try {
    return JSON.parse(sessionStorage.getItem(USERS_KEY)) || [];
  } catch {
    return [];
  }
}

function saveUsers(users) {
  sessionStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function publicUser(user) {
  return { id: user.id, email: user.email, createdAt: user.createdAt };
}

function publicProfile(user) {
  return { ...DEFAULT_PROFILE, display_name: user.email.split("@")[0], ...(user.profile || {}) };
}

function publicPageRanks(user) {
  return { ...(user.preferences?.pageRanks || {}) };
}

function normalizeInviteCode(code) {
  return String(code || "").trim().toUpperCase();
}

function loadInviteCodes() {
  let codes;
  try {
    codes = JSON.parse(sessionStorage.getItem(INVITE_CODES_KEY)) || [];
  } catch {
    codes = [];
  }
  if (!codes.some((invite) => invite.code === DEMO_INVITE_CODE)) {
    codes.unshift({
      code: DEMO_INVITE_CODE,
      createdByUserId: "mock_system",
      createdAt: new Date().toISOString(),
      claimedByUserId: null,
      claimedAt: null,
    });
    saveInviteCodes(codes);
  }
  return codes;
}

function saveInviteCodes(codes) {
  sessionStorage.setItem(INVITE_CODES_KEY, JSON.stringify(codes));
}

function loadLogEntries() {
  try {
    return JSON.parse(sessionStorage.getItem(LOG_KEY)) || [];
  } catch {
    return [];
  }
}

function saveLogEntries(entries) {
  sessionStorage.setItem(LOG_KEY, JSON.stringify(entries));
}

function loadContacts() {
  try {
    return JSON.parse(sessionStorage.getItem(CONTACTS_KEY)) || [];
  } catch {
    return [];
  }
}

function saveContacts(contacts) {
  sessionStorage.setItem(CONTACTS_KEY, JSON.stringify(contacts));
}

function loadRealms() {
  try {
    return JSON.parse(sessionStorage.getItem(REALMS_KEY)) || [];
  } catch {
    return [];
  }
}

function saveRealms(realms) {
  sessionStorage.setItem(REALMS_KEY, JSON.stringify(realms));
}

function loadRealmInvitations() {
  try {
    return JSON.parse(sessionStorage.getItem(REALM_INVITATIONS_KEY)) || [];
  } catch {
    return [];
  }
}

function saveRealmInvitations(invitations) {
  sessionStorage.setItem(REALM_INVITATIONS_KEY, JSON.stringify(invitations));
}

function recordLogEntry({ ownerUserId, actorUserId = ownerUserId, type, inviteCode = null, metadata = null }) {
  const entries = loadLogEntries();
  entries.unshift({
    id: `log_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    ownerUserId,
    actorUserId,
    type,
    inviteCode,
    metadata,
    createdAt: new Date().toISOString(),
  });
  saveLogEntries(entries);
}

function publicInviteCode(invite) {
  return {
    code: invite.code,
    createdAt: invite.createdAt,
    claimedAt: invite.claimedAt || null,
  };
}

function publicContact(contact) {
  const user = loadUsers().find((item) => item.email === contact.email || item.id === contact.userId);
  return {
    id: contact.id,
    email: user?.email || contact.email,
    userId: user?.id || contact.userId || null,
    source: contact.source || "manual",
    createdAt: contact.createdAt,
    registered: Boolean(user),
  };
}

function publicRealm(realm, userId) {
  const member = realm.members.find((item) => item.userId === userId);
  const owner = loadUsers().find((item) => item.id === realm.ownerUserId);
  return {
    id: realm.id,
    title: realm.title,
    description: realm.description || "",
    ownerUserId: realm.ownerUserId,
    ownerEmail: owner?.email || null,
    role: member?.role || (realm.ownerUserId === userId ? "owner" : "member"),
    memberCount: realm.members.length,
    createdAt: realm.createdAt,
    joinedAt: member?.joinedAt || realm.createdAt,
  };
}

function publicRealmInvitation(invitation) {
  const realms = loadRealms();
  const users = loadUsers();
  const realm = realms.find((item) => item.id === invitation.realmId);
  const inviter = users.find((item) => item.id === invitation.inviterUserId);
  const invitee = users.find((item) => item.id === invitation.inviteeUserId);
  return {
    id: invitation.id,
    realmId: invitation.realmId,
    realmTitle: realm?.title || null,
    realmDescription: realm?.description || "",
    inviterEmail: inviter?.email || null,
    inviteeEmail: invitee?.email || null,
    status: invitation.status,
    createdAt: invitation.createdAt,
    respondedAt: invitation.respondedAt || null,
  };
}

function addContact({ ownerUserId, email, source = "manual" }) {
  const normalized = String(email || "").trim().toLowerCase();
  const users = loadUsers();
  const contactUser = users.find((item) => item.email === normalized);
  const contacts = loadContacts();
  const existing = contacts.find((item) => item.ownerUserId === ownerUserId && item.email === normalized);
  if (existing) {
    if (contactUser) existing.userId = contactUser.id;
    saveContacts(contacts);
    return publicContact(existing);
  }
  const contact = {
    id: `con_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    ownerUserId,
    email: normalized,
    userId: contactUser?.id || null,
    source,
    createdAt: new Date().toISOString(),
  };
  contacts.unshift(contact);
  saveContacts(contacts);
  return publicContact(contact);
}

function realmInviteOptionsFor(user) {
  const contacts = loadContacts();
  const users = loadUsers();
  return contacts
    .filter((contact) => contact.email === user.email && contact.ownerUserId !== user.id)
    .map((contact) => users.find((item) => item.id === contact.ownerUserId))
    .filter(Boolean)
    .map(publicUser)
    .sort((a, b) => a.email.localeCompare(b.email));
}

function currentUserId() {
  const token = sessionStorage.getItem(TOKEN_KEY);
  return token?.startsWith("mock:") ? token.slice("mock:".length) : "";
}

function requireCurrentUser() {
  const id = currentUserId();
  const user = loadUsers().find((item) => item.id === id);
  if (!user) {
    const err = new Error("Please sign in to continue.");
    err.code = "UNAUTHENTICATED";
    throw err;
  }
  return user;
}

function randomInviteCode() {
  const parts = [];
  for (let group = 0; group < 3; group++) {
    let part = "";
    for (let i = 0; i < 4; i++) {
      part += INVITE_CODE_ALPHABET[Math.floor(Math.random() * INVITE_CODE_ALPHABET.length)];
    }
    parts.push(part);
  }
  return parts.join("-");
}

// Not cryptographic — this is a front-end-only mock. Never do this for real.
function fauxHash(password) {
  let h = 0;
  for (let i = 0; i < password.length; i++) {
    h = (h << 5) - h + password.charCodeAt(i);
    h |= 0;
  }
  return `mockhash:${h}`;
}

export const mockApi = {
  name: "mock",

  async signUp({ email, password, inviteCode }) {
    await delay(450);

    const normalized = String(email).trim().toLowerCase();
    const normalizedInviteCode = normalizeInviteCode(inviteCode);
    const users = loadUsers();
    const inviteCodes = loadInviteCodes();

    if (users.some((u) => u.email === normalized)) {
      const err = new Error("An account with that email already exists.");
      err.code = "EMAIL_TAKEN";
      throw err;
    }
    if (!normalizedInviteCode) {
      const err = new Error("Enter an invite code.");
      err.code = "INVITE_CODE_REQUIRED";
      throw err;
    }

    const invite = inviteCodes.find(
      (item) => item.code === normalizedInviteCode && !item.claimedByUserId
    );
    if (!invite) {
      const err = new Error("Enter a valid unused invite code.");
      err.code = "INVALID_INVITE_CODE";
      throw err;
    }

    const user = {
      id: `usr_${Date.now().toString(36)}`,
      email: normalized,
      passwordHash: fauxHash(password),
      createdAt: new Date().toISOString(),
      invitedByUserId: invite.createdByUserId,
      profile: { ...DEFAULT_PROFILE, display_name: normalized.split("@")[0] },
    };
    invite.claimedByUserId = user.id;
    invite.claimedAt = new Date().toISOString();
    users.push(user);
    saveUsers(users);
    saveInviteCodes(inviteCodes);
    sessionStorage.setItem(TOKEN_KEY, `mock:${user.id}`);
    addContact({ ownerUserId: invite.createdByUserId, email: normalized, source: "invite_code" });
    recordLogEntry({
      ownerUserId: invite.createdByUserId,
      actorUserId: user.id,
      type: "invitation_accepted",
      inviteCode: normalizedInviteCode,
      metadata: { invitedEmail: normalized },
    });

    return publicUser(user);
  },

  async logIn({ email, password }) {
    await delay(300);

    const normalized = String(email).trim().toLowerCase();
    const passwordHash = fauxHash(password);
    const user = loadUsers().find(
      (user) => user.email === normalized && user.passwordHash === passwordHash
    );

    if (!user) {
      const err = new Error("Email or password is incorrect.");
      err.code = "INVALID_CREDENTIALS";
      throw err;
    }

    sessionStorage.setItem(TOKEN_KEY, `mock:${user.id}`);
    recordLogEntry({ ownerUserId: user.id, type: "sign_in" });
    return publicUser(user);
  },

  async me() {
    await delay(100);

    return publicUser(requireCurrentUser());
  },

  async getProfile() {
    await delay(100);
    const user = requireCurrentUser();
    return { user: publicUser(user), profile: publicProfile(user) };
  },

  async updateProfile(updates) {
    await delay(150);
    const users = loadUsers();
    const user = users.find((item) => item.id === currentUserId());
    if (!user) {
      const err = new Error("Please sign in to continue.");
      err.code = "UNAUTHENTICATED";
      throw err;
    }

    const allowed = ["display_name", "first_name", "last_name", "bio", "default_timezone"];
    const profile = { ...publicProfile(user) };
    for (const key of allowed) {
      if (updates[key] !== undefined) profile[key] = String(updates[key]);
    }
    user.profile = profile;
    saveUsers(users);
    recordLogEntry({
      ownerUserId: user.id,
      type: "profile_change",
      metadata: {
        fields: allowed.filter((key) => updates[key] !== undefined),
      },
    });
    return { user: publicUser(user), profile };
  },

  async listPageRanks() {
    await delay(100);
    const user = requireCurrentUser();
    return { ranks: publicPageRanks(user) };
  },

  async recordPageVisit(path) {
    await delay(80);
    if (!PAGE_RANK_PATHS.has(path)) {
      const err = new Error("Unknown page rank path.");
      err.code = "INVALID_PAGE_RANK_PATH";
      throw err;
    }

    const users = loadUsers();
    const user = users.find((item) => item.id === currentUserId());
    if (!user) {
      const err = new Error("Please sign in to continue.");
      err.code = "UNAUTHENTICATED";
      throw err;
    }

    user.preferences = user.preferences || {};
    user.preferences.pageRanks = user.preferences.pageRanks || {};
    user.preferences.pageRanks[path] = Number(user.preferences.pageRanks[path] || 0) + 1;
    saveUsers(users);
    return { ranks: publicPageRanks(user) };
  },

  async resetPageRanks() {
    await delay(100);
    const users = loadUsers();
    const user = users.find((item) => item.id === currentUserId());
    if (!user) {
      const err = new Error("Please sign in to continue.");
      err.code = "UNAUTHENTICATED";
      throw err;
    }

    user.preferences = user.preferences || {};
    user.preferences.pageRanks = {};
    saveUsers(users);
    return { ranks: {} };
  },

  async listContacts() {
    await delay(100);
    const user = requireCurrentUser();
    return {
      contacts: loadContacts()
        .filter((contact) => contact.ownerUserId === user.id)
        .map(publicContact),
    };
  },

  async addContact({ email }) {
    await delay(150);
    const user = requireCurrentUser();
    const normalized = String(email || "").trim().toLowerCase();
    if (normalized === user.email) {
      const err = new Error("You are already available to your own Realms.");
      err.code = "SELF_CONTACT";
      throw err;
    }
    const contact = addContact({ ownerUserId: user.id, email: normalized, source: "manual" });
    recordLogEntry({
      ownerUserId: user.id,
      type: "contact_added",
      metadata: { contactEmail: normalized },
    });
    return { contact };
  },

  async listRealms() {
    await delay(120);
    const user = requireCurrentUser();
    const realms = loadRealms()
      .filter((realm) => realm.members.some((member) => member.userId === user.id))
      .map((realm) => publicRealm(realm, user.id));
    const invitations = loadRealmInvitations()
      .filter((invitation) => invitation.inviteeUserId === user.id && invitation.status === "pending")
      .map(publicRealmInvitation);
    return { realms, inviteOptions: realmInviteOptionsFor(user), invitations };
  },

  async createRealm({ title, description }) {
    await delay(200);
    const user = requireCurrentUser();
    const cleanTitle = String(title || "").trim();
    if (!cleanTitle) {
      const err = new Error("Enter a Realm title.");
      err.code = "TITLE_REQUIRED";
      throw err;
    }
    const realm = {
      id: `rlm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      ownerUserId: user.id,
      title: cleanTitle.slice(0, 80),
      description: String(description || "").trim().slice(0, 500),
      dbName: `en-rlm-${Date.now().toString(36)}`,
      dbUrl: "mock:realm",
      createdAt: new Date().toISOString(),
      members: [{ userId: user.id, role: "owner", joinedAt: new Date().toISOString() }],
    };
    const realms = loadRealms();
    realms.unshift(realm);
    saveRealms(realms);
    recordLogEntry({
      ownerUserId: user.id,
      type: "realm_created",
      metadata: { realmId: realm.id, title: realm.title },
    });
    return { realm: publicRealm(realm, user.id) };
  },

  async inviteToRealm({ realmId, email }) {
    await delay(150);
    const user = requireCurrentUser();
    const normalized = String(email || "").trim().toLowerCase();
    const users = loadUsers();
    const invitee = users.find((item) => item.email === normalized);
    if (!invitee) {
      const err = new Error("That email does not belong to an account yet.");
      err.code = "INVITEE_NOT_FOUND";
      throw err;
    }
    const realms = loadRealms();
    const realm = realms.find((item) => item.id === realmId && item.ownerUserId === user.id);
    if (!realm) {
      const err = new Error("Realm not found.");
      err.code = "REALM_NOT_FOUND";
      throw err;
    }
    if (!loadContacts().some((contact) => contact.ownerUserId === invitee.id && contact.email === user.email)) {
      const err = new Error("That user must add you as a Contact before you can invite them to a Realm.");
      err.code = "CONTACT_REQUIRED";
      throw err;
    }
    if (realm.members.some((member) => member.userId === invitee.id)) {
      const err = new Error("That user is already a member of this Realm.");
      err.code = "ALREADY_MEMBER";
      throw err;
    }

    const invitations = loadRealmInvitations();
    let invitation = invitations.find(
      (item) => item.realmId === realmId && item.inviteeUserId === invitee.id && item.status === "pending"
    );
    if (!invitation) {
      invitation = {
        id: `rin_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        realmId,
        inviterUserId: user.id,
        inviteeUserId: invitee.id,
        status: "pending",
        createdAt: new Date().toISOString(),
        respondedAt: null,
      };
      invitations.unshift(invitation);
      saveRealmInvitations(invitations);
    }
    recordLogEntry({
      ownerUserId: invitee.id,
      actorUserId: user.id,
      type: "realm_invitation_received",
      metadata: { realmId, realmTitle: realm.title },
    });
    return { invitation: publicRealmInvitation(invitation) };
  },

  async listRealmNotifications() {
    await delay(100);
    const user = requireCurrentUser();
    const invitations = loadRealmInvitations()
      .filter((invitation) => invitation.inviteeUserId === user.id && invitation.status === "pending")
      .map(publicRealmInvitation);
    return { invitations, count: invitations.length };
  },

  async respondToRealmInvitation({ invitationId, response }) {
    await delay(150);
    const user = requireCurrentUser();
    const invitations = loadRealmInvitations();
    const invitation = invitations.find(
      (item) => item.id === invitationId && item.inviteeUserId === user.id && item.status === "pending"
    );
    if (!invitation) {
      const err = new Error("Invitation not found.");
      err.code = "INVITATION_NOT_FOUND";
      throw err;
    }
    invitation.status = response === "accept" ? "accepted" : "declined";
    invitation.respondedAt = new Date().toISOString();
    if (invitation.status === "accepted") {
      const realms = loadRealms();
      const realm = realms.find((item) => item.id === invitation.realmId);
      if (realm && !realm.members.some((member) => member.userId === user.id)) {
        realm.members.push({ userId: user.id, role: "member", joinedAt: invitation.respondedAt });
        saveRealms(realms);
      }
    }
    saveRealmInvitations(invitations);
    recordLogEntry({
      ownerUserId: user.id,
      type: `realm_invitation_${invitation.status}`,
      metadata: { realmId: invitation.realmId },
    });
    return { invitation: publicRealmInvitation(invitation) };
  },

  async changePassword({ currentPassword, newPassword }) {
    await delay(150);
    const users = loadUsers();
    const user = users.find((item) => item.id === currentUserId());
    if (!user) {
      const err = new Error("Please sign in to continue.");
      err.code = "UNAUTHENTICATED";
      throw err;
    }
    if (user.passwordHash !== fauxHash(currentPassword)) {
      const err = new Error("Current password is incorrect.");
      err.code = "INVALID_CURRENT_PASSWORD";
      throw err;
    }
    if (String(newPassword || "").length < 8) {
      const err = new Error("New password must be at least 8 characters.");
      err.code = "WEAK_PASSWORD";
      throw err;
    }

    user.passwordHash = fauxHash(newPassword);
    saveUsers(users);
    recordLogEntry({ ownerUserId: user.id, type: "password_change" });
    return { ok: true };
  },

  async listLogEntries() {
    await delay(100);
    const user = requireCurrentUser();
    const users = loadUsers();
    const entries = loadLogEntries()
      .filter((entry) => entry.ownerUserId === user.id)
      .map((entry) => ({
        id: entry.id,
        type: entry.type,
        createdAt: entry.createdAt,
        actorEmail: users.find((item) => item.id === entry.actorUserId)?.email || null,
        inviteCode: entry.inviteCode || null,
        metadata: entry.metadata || null,
      }));
    return { entries };
  },

  async listUsers() {
    await delay(100);
    return loadUsers().map(publicUser);
  },

  logOut() {
    clearSession();
  },

  async listInviteCodes() {
    await delay(100);
    const userId = currentUserId();
    const inviteCodes = loadInviteCodes().filter((invite) => invite.createdByUserId === userId);
    return {
      inviteCodes: inviteCodes.map(publicInviteCode),
      remaining: Math.max(0, MAX_INVITE_CODES_PER_USER - inviteCodes.length),
    };
  },

  async createInviteCodes({ count = 1 } = {}) {
    await delay(200);
    const userId = currentUserId();
    if (!userId) {
      const err = new Error("Sign in before creating invite codes.");
      err.code = "UNAUTHORIZED";
      throw err;
    }

    const amount = Number(count);
    if (!Number.isInteger(amount) || amount < 1 || amount > MAX_INVITE_CODES_PER_USER) {
      const err = new Error("Request between 1 and 100 invite codes.");
      err.code = "INVALID_INVITE_COUNT";
      throw err;
    }

    const inviteCodes = loadInviteCodes();
    const createdCount = inviteCodes.filter((invite) => invite.createdByUserId === userId).length;
    const remaining = MAX_INVITE_CODES_PER_USER - createdCount;
    if (amount > remaining) {
      const err = new Error(`You can create ${remaining} more invite code${remaining === 1 ? "" : "s"}.`);
      err.code = "INVITE_LIMIT_REACHED";
      throw err;
    }

    const created = [];
    while (created.length < amount) {
      const code = randomInviteCode();
      if (inviteCodes.some((invite) => invite.code === code)) continue;
      const invite = {
        code,
        createdByUserId: userId,
        createdAt: new Date().toISOString(),
        claimedByUserId: null,
        claimedAt: null,
      };
      inviteCodes.push(invite);
      created.push(invite);
    }

    saveInviteCodes(inviteCodes);
    recordLogEntry({
      ownerUserId: userId,
      type: "invite_created",
      metadata: { count: created.length },
    });
    return {
      inviteCodes: created.map(publicInviteCode),
      remaining: remaining - created.length,
    };
  },
};
