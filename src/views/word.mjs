import { el, clear } from "../ui.mjs";
import { page } from "../layout.mjs";
import { navigate } from "../router.mjs";
import { getApi } from "../api/index.mjs";
import { getSessionEmail } from "../session.mjs";
import { breadcrumb, definitionCard, setAlert, wordTitle } from "./realm-ui.mjs";

function historyLabel(event) {
  if (event.eventType === "consensus_changed") return "Current definition changed";
  if (event.eventType === "pick_changed") return "Pick updated";
  if (event.eventType === "definition_forked") return "Definition forked";
  if (event.eventType === "definition_created") return "Definition added";
  if (event.eventType === "word_created") return "Word created";
  if (event.eventType === "thread_collapsed") return "Side thread collapsed";
  return event.eventType;
}

export function renderWord(outlet, params = {}) {
  const email = getSessionEmail();
  if (!email) {
    navigate("/signin", { replace: true });
    return;
  }

  const realmId = params.realmId;
  const wordId = params.wordId;
  const tab = new URLSearchParams(window.location.search).get("tab") || "definitions";
  const forkId = new URLSearchParams(window.location.search).get("fork") || "";

  const state = {
    realm: null,
    word: null,
    currentDefinitions: [],
    alternativeDefinitions: [],
    myPickId: null,
    events: [],
    error: "",
    success: "",
    viewing: null,
  };
  const body = el("div", { class: "profile-card-body" });
  const card = el("div", { class: "card wide-card" }, [body]);

  async function reload(message = "") {
    try {
      const data = await getApi().getRealmWord({ realmId, wordId });
      state.realm = data.realm;
      state.word = data.word;
      state.currentDefinitions = data.currentDefinitions || [];
      state.alternativeDefinitions = data.alternativeDefinitions || [];
      state.myPickId = data.myPickId;
      state.success = message;
      state.error = "";
      if (tab === "history") {
        const history = await getApi().listWordHistory({ realmId, wordId });
        state.events = history.events || [];
      }
    } catch (err) {
      state.error = err.message || "Could not load this word.";
      state.success = "";
    }
    render();
  }

  async function pick(definitionId) {
    try {
      await getApi().pickDefinition({ realmId, wordId, definitionId });
      await reload("Pick updated.");
    } catch (err) {
      state.error = err.message || "Could not update your pick.";
      render();
    }
  }

  function forkForm(source) {
    const input = el("textarea", {
      id: "fork-body",
      rows: "5",
      maxlength: "4000",
      text: source?.body || "",
    });
    input.value = source?.body || "";
    const submit = el("button", { type: "submit", class: "btn btn-primary", text: "Fork definition" });
    const formError = el("p", { class: "error" });

    async function onSubmit(event) {
      event.preventDefault();
      submit.disabled = true;
      try {
        await getApi().forkDefinition({ realmId, definitionId: source.id, body: input.value });
        navigate(`/realms/${encodeURIComponent(realmId)}/words/${encodeURIComponent(wordId)}`);
      } catch (err) {
        formError.textContent = err.message || "Could not fork the definition.";
        submit.disabled = false;
      }
    }

    return el("form", { class: "stack-form panel", onsubmit: onSubmit }, [
      el("h3", { text: "Fork definition" }),
      el("p", { class: "muted", text: "Creates a new alternative under the same word." }),
      input,
      formError,
      submit,
    ]);
  }

  function proposeForm() {
    const input = el("textarea", { id: "new-definition", rows: "4", maxlength: "4000" });
    const submit = el("button", { type: "submit", class: "btn btn-ghost", text: "Propose definition" });
    const formError = el("p", { class: "error" });
    async function onSubmit(event) {
      event.preventDefault();
      if (!input.value.trim()) {
        formError.textContent = "Enter a definition.";
        return;
      }
      submit.disabled = true;
      try {
        await getApi().createDefinition({ realmId, wordId, body: input.value });
        await reload("Definition added.");
      } catch (err) {
        formError.textContent = err.message || "Could not add the definition.";
        submit.disabled = false;
      }
    }
    return el("form", { class: "stack-form panel", onsubmit: onSubmit }, [
      el("h3", { text: "Propose another definition" }),
      input,
      formError,
      submit,
    ]);
  }

  function definitionList(title, definitions) {
    if (!definitions.length) return null;
    return el("section", { class: "panel" }, [
      el("h3", { text: title }),
      el(
        "div",
        { class: "definition-stack" },
        definitions.map((definition) =>
          definitionCard(definition, {
            realmId,
            wordId,
            picked: state.myPickId === definition.id,
            onPick: () => pick(definition.id),
            forkHref: `/realms/${encodeURIComponent(realmId)}/words/${encodeURIComponent(wordId)}?fork=${encodeURIComponent(definition.id)}`,
          })
        )
      ),
    ]);
  }

  function historyList() {
    if (!state.events.length) return el("p", { class: "muted", text: "No history yet." });
    return el(
      "ul",
      { class: "entity-list" },
      state.events.map((event) => {
        const view = el("button", {
          type: "button",
          class: "btn btn-small btn-ghost",
          text: "View",
          onclick: async () => {
            try {
              const data = await getApi().getHistoryEvent({ realmId, eventId: event.id });
              state.viewing = data.readable;
              render();
            } catch (err) {
              state.error = err.message || "Could not open that history entry.";
              render();
            }
          },
        });
        return el("li", { class: "entity-row entity-row-stack" }, [
          el("div", {}, [
            el("strong", { text: historyLabel(event) }),
            el("span", { class: "muted", text: `${event.actorName || event.actorEmail || "Someone"} · ${event.createdAt}` }),
          ]),
          view,
        ]);
      })
    );
  }

  function render() {
    const alert = el("div");
    setAlert(alert, state.error ? "error" : "ok", state.error || state.success);
    const title = state.word ? wordTitle(state.word) : "Word";
    const forkSource = [...state.currentDefinitions, ...state.alternativeDefinitions].find((item) => item.id === forkId);
    clear(body);
    body.append(
      breadcrumb([
        { href: "/realms", label: "Realms" },
        { href: `/realms/${encodeURIComponent(realmId)}`, label: state.realm?.title || "Realm" },
        { label: title },
      ]),
      el("h2", { text: title }),
      el("p", { class: "subtitle", text: "Pick the definition you agree with most. Ties are shown together as the current definition." }),
      alert,
      el("div", { class: "tab-bar" }, [
        el("a", {
          href: `/realms/${encodeURIComponent(realmId)}/words/${encodeURIComponent(wordId)}`,
          "data-link": "",
          class: tab === "history" ? "btn btn-small btn-ghost" : "btn btn-small btn-primary",
          text: "Definitions",
        }),
        el("a", {
          href: `/realms/${encodeURIComponent(realmId)}/words/${encodeURIComponent(wordId)}?tab=history`,
          "data-link": "",
          class: tab === "history" ? "btn btn-small btn-primary" : "btn btn-small btn-ghost",
          text: "Definition History",
        }),
      ])
    );

    if (tab === "history") {
      body.append(el("section", { class: "panel" }, [el("h3", { text: "Definition History" }), historyList()]));
      if (state.viewing) {
        body.append(
          el("section", { class: "panel readable-definition" }, [
            el("h3", { text: wordTitle({ name: state.viewing.name, clarifier: state.viewing.clarifier }) }),
            el("p", { class: "definition-body", text: state.viewing.body || "No definition text." }),
          ])
        );
      }
      return;
    }

    if (forkSource) body.append(forkForm(forkSource));
    body.append(
      definitionList(
        state.currentDefinitions.length > 1 ? "Current Definitions (tied)" : "Current Definition",
        state.currentDefinitions
      ),
      definitionList("Alternative definitions", state.alternativeDefinitions),
      proposeForm()
    );
  }

  clear(outlet);
  outlet.append(page(card));
  body.append(el("div", { class: "profile-loading", role: "status" }, [el("p", { class: "muted", text: "Loading word..." })]));
  reload();
}
