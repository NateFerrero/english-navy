import { el, clear } from "../ui.mjs";
import { page } from "../layout.mjs";
import { navigate } from "../router.mjs";
import { getApi } from "../api/index.mjs";
import { getSessionEmail } from "../session.mjs";
import { breadcrumb, definitionCard, setAlert, wordTitle } from "./realm-ui.mjs";

export function renderDefinition(outlet, params = {}) {
  const email = getSessionEmail();
  if (!email) {
    navigate("/signin", { replace: true });
    return;
  }

  const realmId = params.realmId;
  const wordId = params.wordId;
  const definitionId = params.definitionId;
  const state = {
    realm: null,
    word: null,
    definition: null,
    myPickId: null,
    messages: [],
    resolutions: {},
    error: "",
    success: "",
  };
  const body = el("div", { class: "profile-card-body" });
  const card = el("div", { class: "card wide-card" }, [body]);

  async function reload(message = "") {
    try {
      const data = await getApi().getRealmDefinition({ realmId, definitionId });
      state.realm = data.realm;
      state.word = data.word;
      state.definition = data.definition;
      state.myPickId = data.myPickId;
      state.messages = data.messages || [];
      state.resolutions = data.resolutions || {};
      state.success = message;
      state.error = "";
    } catch (err) {
      state.error = err.message || "Could not load this definition.";
      state.success = "";
    }
    render();
  }

  async function run(fn, ok) {
    try {
      await fn();
      await reload(ok);
    } catch (err) {
      state.error = err.message || "Could not save.";
      render();
    }
  }

  function composer({ placeholder, submitLabel, onSubmit }) {
    const input = el("textarea", { rows: "3", maxlength: "2000", placeholder });
    const error = el("p", { class: "error" });
    const submit = el("button", { type: "submit", class: "btn btn-small btn-ghost", text: submitLabel });
    return el("form", {
      class: "stack-form",
      onsubmit: (event) => {
        event.preventDefault();
        if (!input.value.trim()) {
          error.textContent = "Enter a message.";
          return;
        }
        onSubmit(input.value);
      },
    }, [input, error, submit]);
  }

  function resolutionPanel(threadId) {
    const resolution = state.resolutions[threadId];
    if (!resolution?.canResolve) return null;
    const parts = [];
    if (resolution.status === "pending") {
      parts.push(el("p", { class: "muted", text: `Proposed consensus: ${resolution.consensusBody}` }));
      parts.push(
        el("p", {
          class: "muted",
          text: resolution.missingIds?.length
            ? `Waiting on ${resolution.missingIds.length} active participant${resolution.missingIds.length === 1 ? "" : "s"}.`
            : "All active participants have agreed.",
        })
      );
      const already = resolution.agreements?.some((item) => item.agreed && item.userId);
      parts.push(
        el("button", {
          type: "button",
          class: "btn btn-small btn-primary",
          text: "Agree",
          onclick: () => run(() => getApi().agreeResolution({ realmId, threadId }), "Agreement recorded."),
        })
      );
      if (already) {
        /* Agree is still safe if already agreed */
      }
    }
    parts.push(
      composer({
        placeholder: "Final consensus message",
        submitLabel: "Propose consensus",
        onSubmit: (value) => run(() => getApi().proposeResolution({ realmId, threadId, body: value }), "Consensus proposed."),
      })
    );
    return el("div", { class: "resolution-panel" }, [el("h4", { text: "Resolve side thread" }), ...parts]);
  }

  function renderMessage(message, nested = false) {
    const sideRoots = state.messages.filter((item) => item.isSideThreadRoot && item.parentId === message.id);
    const threadChildren = state.messages.filter(
      (item) => item.parentId === message.id && item.threadId && item.threadId === message.threadId && !item.isSideThreadRoot
    );

    const actions = [];
    if (!message.threadId) {
      actions.push(
        composer({
          placeholder: "Start a side thread",
          submitLabel: "Start side thread",
          onSubmit: (value) => run(() => getApi().startBranch({ realmId, parentId: message.id, body: value }), "Side thread started."),
        })
      );
    } else {
      actions.push(
        composer({
          placeholder: "Reply in this side thread",
          submitLabel: "Reply",
          onSubmit: (value) => run(() => getApi().replyInThread({ realmId, parentId: message.id, body: value }), "Reply added."),
        })
      );
    }

    return el("li", { class: `sam-message${message.kind === "consensus" ? " sam-consensus" : ""}${nested ? " sam-nested" : ""}` }, [
      message.kind === "consensus" ? el("span", { class: "pill", text: "Consensus" }) : null,
      el("strong", { text: message.authorName || message.authorEmail || "Unknown" }),
      el("p", { text: message.body }),
      el("span", { class: "muted", text: message.createdAt }),
      ...actions,
      message.isSideThreadRoot ? resolutionPanel(message.id) : null,
      threadChildren.length ? el("ul", { class: "sam-thread" }, threadChildren.map((item) => renderMessage(item, true))) : null,
      sideRoots.length
        ? el("div", { class: "sam-side" }, [
            el("h4", { text: "Side threads" }),
            el("ul", { class: "sam-thread" }, sideRoots.map((item) => renderMessage(item, true))),
          ])
        : null,
    ]);
  }

  function render() {
    const alert = el("div");
    setAlert(alert, state.error ? "error" : "ok", state.error || state.success);
    const title = state.word ? wordTitle(state.word) : "Definition";
    const mains = state.messages.filter((message) => !message.threadId);
    clear(body);
    body.append(
      breadcrumb([
        { href: "/realms", label: "Realms" },
        { href: `/realms/${encodeURIComponent(realmId)}`, label: state.realm?.title || "Realm" },
        { href: `/realms/${encodeURIComponent(realmId)}/words/${encodeURIComponent(wordId)}`, label: title },
        { label: "Definition" },
      ]),
      el("h2", { text: title }),
      alert,
      state.definition
        ? definitionCard(state.definition, {
            realmId,
            wordId,
            picked: state.myPickId === state.definition.id,
            onPick: () => run(() => getApi().pickDefinition({ realmId, wordId, definitionId }), "Pick updated."),
            forkHref: `/realms/${encodeURIComponent(realmId)}/words/${encodeURIComponent(wordId)}?fork=${encodeURIComponent(definitionId)}`,
          })
        : null,
      el("section", { class: "panel" }, [
        el("h3", { text: "Structured Argument Map" }),
        el("p", { class: "muted", text: "Main-thread arguments stay open. Side threads collapse into a single consensus message when every active participant agrees." }),
        mains.length
          ? el("ul", { class: "sam-thread" }, mains.map((message) => renderMessage(message)))
          : el("p", { class: "muted", text: "No arguments yet." }),
        composer({
          placeholder: "Add a top-level argument",
          submitLabel: "Add argument",
          onSubmit: (value) => run(() => getApi().addArgument({ realmId, definitionId, body: value }), "Argument added."),
        }),
      ])
    );
  }

  clear(outlet);
  outlet.append(page(card));
  body.append(el("div", { class: "profile-loading", role: "status" }, [el("p", { class: "muted", text: "Loading definition..." })]));
  reload();
}
