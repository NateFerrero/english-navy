import { el, clear } from "../ui.mjs";
import { page } from "../layout.mjs";
import { navigate } from "../router.mjs";
import { getApi } from "../api/index.mjs";
import { getSessionEmail } from "../session.mjs";

function setAlert(container, kind, message) {
  clear(container);
  if (message) container.append(el("div", { class: `alert alert-${kind}`, text: message }));
}

function profileValue(value) {
  const clean = String(value || "").trim();
  return clean || "Not set";
}

export function renderProfile(outlet) {
  const email = getSessionEmail();
  if (!email) {
    navigate("/signin", { replace: true });
    return;
  }

  const state = {
    error: "",
    success: "",
    profile: null,
  };

  const body = el("div", { class: "profile-card-body" });
  const card = el("div", { class: "card" }, [
    el("h2", { text: "Profile" }),
    el("p", { class: "subtitle", text: "Your account information." }),
    body,
  ]);

  function renderLoading() {
    clear(body);
    body.append(
      el("div", { class: "profile-loading", role: "status", "aria-live": "polite" }, [
        el("p", { class: "muted", text: "Loading profile..." }),
      ]),
    );
  }

  function renderView() {
    const alert = el("div");
    setAlert(alert, state.error ? "error" : "ok", state.error || state.success);

    clear(body);
    if (!state.profile) {
      body.append(
        alert,
        el("button", {
          type: "button",
          class: "btn btn-primary",
          text: "Retry loading profile",
          onclick: loadProfile,
        }),
      );
      return;
    }

    body.append(
      alert,
      el("dl", { class: "profile-details" }, [
        el("div", {}, [
          el("dt", { text: "Email" }),
          el("dd", { text: email }),
        ]),
        el("div", {}, [
          el("dt", { text: "First name" }),
          el("dd", { text: profileValue(state.profile?.first_name) }),
        ]),
        el("div", {}, [
          el("dt", { text: "Last name" }),
          el("dd", { text: profileValue(state.profile?.last_name) }),
        ]),
      ]),
      el("button", {
        type: "button",
        class: "btn btn-primary",
        text: "Edit profile",
        onclick: () => {
          state.error = "";
          state.success = "";
          renderEdit();
        },
      }),
    );
  }

  function renderEdit() {
    const formAlert = el("div");
    const firstNameInput = el("input", {
      id: "first-name",
      name: "first-name",
      type: "text",
      autocomplete: "given-name",
      value: state.profile?.first_name || "",
    });
    const lastNameInput = el("input", {
      id: "last-name",
      name: "last-name",
      type: "text",
      autocomplete: "family-name",
      value: state.profile?.last_name || "",
    });
    const submit = el("button", {
      type: "submit",
      class: "btn btn-primary",
      text: "Save profile",
    });

    async function onSubmit(event) {
      event.preventDefault();
      setAlert(formAlert, null, "");
      submit.disabled = true;
      submit.textContent = "Saving...";

      try {
        const data = await getApi().updateProfile({
          first_name: firstNameInput.value.trim(),
          last_name: lastNameInput.value.trim(),
        });
        state.profile = data.profile;
        state.success = "Profile updated.";
        state.error = "";
        renderView();
      } catch (err) {
        setAlert(formAlert, "error", err.message || "Could not update your profile.");
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
      el("button", {
        type: "button",
        class: "btn btn-ghost profile-cancel",
        text: "Cancel",
        onclick: () => {
          state.error = "";
          state.success = "";
          renderView();
        },
      }),
    ]);

    clear(body);
    body.append(form);
    firstNameInput.focus();
  }

  async function loadProfile() {
    renderLoading();
    try {
      const data = await getApi().getProfile();
      state.profile = data.profile || {};
      state.error = "";
    } catch (err) {
      state.profile = null;
      state.error = err.message || "Could not load your profile.";
    } finally {
      renderView();
    }
  }

  clear(outlet);
  outlet.append(page(card));
  loadProfile();
}
