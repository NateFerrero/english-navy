import { el, clear } from "../ui.mjs";
import { page } from "../layout.mjs";
import { navigate } from "../router.mjs";
import { getApi } from "../api/index.mjs";
import { getSessionEmail } from "../session.mjs";
import { breadcrumb, previewText, setAlert, wordTitle } from "./realm-ui.mjs";

export function renderRealm(outlet, params = {}) {
  const email = getSessionEmail();
  if (!email) {
    navigate("/signin", { replace: true });
    return;
  }

  const realmId = params.realmId;
  const state = { realm: null, words: [], error: "", success: "" };
  const body = el("div", { class: "profile-card-body" });
  const card = el("div", { class: "card wide-card" }, [body]);

  async function reload(message = "") {
    try {
      const data = await getApi().listRealmWords({ realmId });
      state.realm = data.realm;
      state.words = data.words || [];
      state.success = message;
      state.error = "";
    } catch (err) {
      state.error = err.message || "Could not load this Realm.";
      state.success = "";
    }
    render();
  }

  function createForm() {
    const nameInput = el("input", { id: "word-name", name: "word-name", type: "text", maxlength: "80" });
    const clarifierInput = el("input", {
      id: "word-clarifier",
      name: "word-clarifier",
      type: "text",
      maxlength: "80",
      placeholder: "General",
    });
    const definitionInput = el("textarea", {
      id: "word-definition",
      name: "word-definition",
      rows: "4",
      maxlength: "4000",
    });
    const submit = el("button", { type: "submit", class: "btn btn-primary", text: "Add word" });
    const formError = el("p", { class: "error" });

    async function onSubmit(event) {
      event.preventDefault();
      formError.textContent = "";
      const name = nameInput.value.trim();
      const definition = definitionInput.value.trim();
      if (!name) {
        formError.textContent = "Enter a word or phrase.";
        return;
      }
      if (!definition) {
        formError.textContent = "Enter a definition.";
        return;
      }
      submit.disabled = true;
      submit.textContent = "Saving...";
      try {
        await getApi().createWord({
          realmId,
          name,
          clarifier: clarifierInput.value.trim() || "General",
          definition,
        });
        await reload("Word added.");
      } catch (err) {
        formError.textContent = err.message || "Could not add the word.";
        submit.disabled = false;
        submit.textContent = "Add word";
      }
    }

    return el("form", { class: "stack-form panel", novalidate: "", onsubmit: onSubmit }, [
      el("h3", { text: "New word or phrase" }),
      el("div", { class: "field" }, [el("label", { for: "word-name", text: "Name" }), nameInput]),
      el("div", { class: "field" }, [
        el("label", { for: "word-clarifier", text: "Clarifier" }),
        clarifierInput,
        el("p", { class: "muted", text: "Clarifiers disambiguate the same name, e.g. Animal vs Computer Device." }),
      ]),
      el("div", { class: "field" }, [el("label", { for: "word-definition", text: "Definition" }), definitionInput, formError]),
      submit,
    ]);
  }

  function wordsList() {
    if (!state.words.length) return el("p", { class: "muted", text: "No words yet." });
    return el(
      "ul",
      { class: "entity-list" },
      state.words.map((word) =>
        el("li", { class: "entity-row entity-row-stack" }, [
          el("a", { href: `/realms/${encodeURIComponent(realmId)}/words/${encodeURIComponent(word.id)}`, "data-link": "" }, [
            el("strong", { text: wordTitle(word) }),
            el("span", {
              class: "muted",
              text: word.previewBody ? `Definition: ${previewText(word.previewBody)}` : "No definition yet.",
            }),
          ]),
        ])
      )
    );
  }

  function render() {
    const alert = el("div");
    setAlert(alert, state.error ? "error" : "ok", state.error || state.success);
    const title = state.realm?.title || "Realm";
    clear(body);
    body.append(
      breadcrumb([{ href: "/realms", label: "Realms" }, { label: title }]),
      el("h2", { text: title }),
      state.realm?.description ? el("p", { class: "subtitle", text: state.realm.description }) : el("p", { class: "subtitle", text: "Define words and phrases by continuous consensus." }),
      alert,
      createForm(),
      el("section", { class: "panel" }, [el("h3", { text: "Words and phrases" }), wordsList()])
    );
  }

  clear(outlet);
  outlet.append(page(card));
  body.append(el("div", { class: "profile-loading", role: "status" }, [el("p", { class: "muted", text: "Loading Realm..." })]));
  reload();
}
