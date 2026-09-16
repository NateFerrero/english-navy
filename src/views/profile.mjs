import { el, clear } from "../ui.mjs";
import { page } from "../layout.mjs";
import { navigate } from "../router.mjs";
import { getApi } from "../api/index.mjs";
import { getSessionEmail } from "../session.mjs";

function setAlert(container, kind, message) {
  clear(container);
  if (message) container.append(el("div", { class: `alert alert-${kind}`, text: message }));
}

export function renderProfile(outlet) {
  const email = getSessionEmail();
  if (!email) {
    navigate("/signin", { replace: true });
    return;
  }

  const formAlert = el("div");
  const status = el("p", { class: "muted", text: "Loading profile..." });
  const firstNameInput = el("input", {
    id: "first-name",
    name: "first-name",
    type: "text",
    autocomplete: "given-name",
  });
  const lastNameInput = el("input", {
    id: "last-name",
    name: "last-name",
    type: "text",
    autocomplete: "family-name",
  });
  const submit = el("button", {
    type: "submit",
    class: "btn btn-primary",
    text: "Save profile",
  });

  async function loadProfile() {
    try {
      const data = await getApi().getProfile();
      firstNameInput.value = data.profile?.first_name || "";
      lastNameInput.value = data.profile?.last_name || "";
      status.textContent = "";
    } catch (err) {
      status.textContent = err.message || "Could not load your profile.";
    }
  }

  async function onSubmit(event) {
    event.preventDefault();
    setAlert(formAlert, null, "");
    submit.disabled = true;
    submit.textContent = "Saving...";

    try {
      await getApi().updateProfile({
        first_name: firstNameInput.value.trim(),
        last_name: lastNameInput.value.trim(),
      });
      setAlert(formAlert, "ok", "Profile updated.");
    } catch (err) {
      setAlert(formAlert, "error", err.message || "Could not update your profile.");
    } finally {
      submit.disabled = false;
      submit.textContent = "Save profile";
    }
  }

  const form = el("form", { novalidate: "", onsubmit: onSubmit }, [
    formAlert,
    el("div", { class: "field" }, [
      el("label", { for: "first-name", text: "First name" }),
      firstNameInput,
    ]),
    el("div", { class: "field" }, [
      el("label", { for: "last-name", text: "Last name" }),
      lastNameInput,
    ]),
    submit,
  ]);

  const card = el("div", { class: "card" }, [
    el("h2", { text: "Profile" }),
    el("p", { class: "subtitle", text: "Set the name shown on your account." }),
    status,
    form,
  ]);

  clear(outlet);
  outlet.append(page(card));
  loadProfile();
  firstNameInput.focus();
}
