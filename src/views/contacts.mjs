import { el, clear, isValidEmail } from "../ui.mjs";
import { page } from "../layout.mjs";
import { navigate } from "../router.mjs";
import { getApi } from "../api/index.mjs";
import { getSessionEmail } from "../session.mjs";

function setAlert(container, kind, message) {
  clear(container);
  if (message) container.append(el("div", { class: `alert alert-${kind}`, text: message }));
}

function contactSource(contact) {
  return contact.source === "invite_code" ? "Joined with your invite code" : "Added by email";
}

export function renderContacts(outlet) {
  const email = getSessionEmail();
  if (!email) {
    navigate("/signin", { replace: true });
    return;
  }

  const state = { contacts: [], error: "", success: "" };
  const body = el("div", { class: "profile-card-body" });
  const card = el("div", { class: "card wide-card" }, [
    el("h2", { text: "Contacts" }),
    el("p", {
      class: "subtitle",
      text: "Contacts can invite you to their Realms after you accept their Realm invitation.",
    }),
    body,
  ]);

  function renderList() {
    if (!state.contacts.length) {
      return el("p", { class: "muted", text: "No contacts yet. Add someone by email to let them invite you." });
    }
    return el(
      "ul",
      { class: "entity-list" },
      state.contacts.map((contact) =>
        el("li", { class: "entity-row" }, [
          el("div", {}, [
            el("strong", { text: contact.email }),
            el("span", {
              class: "muted",
              text: `${contactSource(contact)} - ${contact.registered ? "Account found" : "No account yet"}`,
            }),
          ]),
        ])
      )
    );
  }

  function render() {
    const alert = el("div");
    setAlert(alert, state.error ? "error" : "ok", state.error || state.success);
    const emailInput = el("input", {
      id: "contact-email",
      name: "contact-email",
      type: "email",
      autocomplete: "email",
      placeholder: "friend@example.com",
    });
    const submit = el("button", { type: "submit", class: "btn btn-primary", text: "New contact" });
    const formError = el("p", { class: "error" });

    async function onSubmit(event) {
      event.preventDefault();
      const contactEmail = emailInput.value.trim();
      formError.textContent = "";
      if (!isValidEmail(contactEmail)) {
        formError.textContent = "Enter a valid email address.";
        return;
      }
      submit.disabled = true;
      submit.textContent = "Adding...";
      try {
        await getApi().addContact({ email: contactEmail });
        state.success = "Contact added.";
        state.error = "";
        await loadContacts();
      } catch (err) {
        state.error = err.message || "Could not add that contact.";
        state.success = "";
        render();
      }
    }

    const form = el("form", { class: "stack-form", novalidate: "", onsubmit: onSubmit }, [
      el("div", { class: "field" }, [
        el("label", { for: "contact-email", text: "Email address" }),
        emailInput,
        formError,
      ]),
      submit,
    ]);

    clear(body);
    body.append(alert, form, renderList());
  }

  async function loadContacts() {
    clear(body);
    body.append(el("div", { class: "profile-loading", role: "status" }, [el("p", { class: "muted", text: "Loading contacts..." })]));
    try {
      const data = await getApi().listContacts();
      state.contacts = data.contacts || [];
      state.error = "";
    } catch (err) {
      state.error = err.message || "Could not load contacts.";
    }
    render();
  }

  clear(outlet);
  outlet.append(page(card));
  loadContacts();
}
