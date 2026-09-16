import { el, clear } from "../ui.mjs";
import { page } from "../layout.mjs";
import { navigate } from "../router.mjs";
import { getApi } from "../api/index.mjs";
import { getSessionEmail } from "../session.mjs";

const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Asia/Tokyo",
  "Australia/Sydney",
];

function setAlert(container, kind, message) {
  clear(container);
  if (message) container.append(el("div", { class: `alert alert-${kind}`, text: message }));
}

function timezoneOptions(selected) {
  return TIMEZONES.map((timezone) =>
    el("option", { value: timezone, text: timezone, selected: timezone === selected })
  );
}

export function renderSettings(outlet) {
  const email = getSessionEmail();
  if (!email) {
    navigate("/signin", { replace: true });
    return;
  }

  const timezoneAlert = el("div");
  const passwordAlert = el("div");
  const timezoneSelect = el("select", {
    id: "default-timezone",
    name: "default-timezone",
  });
  const currentPasswordInput = el("input", {
    id: "current-password",
    name: "current-password",
    type: "password",
    autocomplete: "current-password",
    required: "",
  });
  const newPasswordInput = el("input", {
    id: "new-password",
    name: "new-password",
    type: "password",
    autocomplete: "new-password",
    placeholder: "At least 8 characters",
    required: "",
  });
  const confirmPasswordInput = el("input", {
    id: "confirm-password",
    name: "confirm-password",
    type: "password",
    autocomplete: "new-password",
    required: "",
  });
  const timezoneSubmit = el("button", {
    type: "submit",
    class: "btn btn-primary",
    text: "Save timezone",
  });
  const passwordSubmit = el("button", {
    type: "submit",
    class: "btn btn-primary",
    text: "Change password",
  });

  async function loadSettings() {
    timezoneSelect.replaceChildren(...timezoneOptions("UTC"));
    try {
      const data = await getApi().getProfile();
      const selected = data.profile?.default_timezone || "UTC";
      timezoneSelect.replaceChildren(...timezoneOptions(selected));
    } catch (err) {
      setAlert(timezoneAlert, "error", err.message || "Could not load settings.");
    }
  }

  async function onTimezoneSubmit(event) {
    event.preventDefault();
    setAlert(timezoneAlert, null, "");
    timezoneSubmit.disabled = true;
    timezoneSubmit.textContent = "Saving...";

    try {
      await getApi().updateProfile({ default_timezone: timezoneSelect.value });
      setAlert(timezoneAlert, "ok", "Default timezone updated.");
    } catch (err) {
      setAlert(timezoneAlert, "error", err.message || "Could not save timezone.");
    } finally {
      timezoneSubmit.disabled = false;
      timezoneSubmit.textContent = "Save timezone";
    }
  }

  async function onPasswordSubmit(event) {
    event.preventDefault();
    setAlert(passwordAlert, null, "");

    if (newPasswordInput.value.length < 8) {
      setAlert(passwordAlert, "error", "New password must be at least 8 characters.");
      return;
    }
    if (newPasswordInput.value !== confirmPasswordInput.value) {
      setAlert(passwordAlert, "error", "New passwords do not match.");
      return;
    }

    passwordSubmit.disabled = true;
    passwordSubmit.textContent = "Changing...";
    try {
      await getApi().changePassword({
        currentPassword: currentPasswordInput.value,
        newPassword: newPasswordInput.value,
      });
      currentPasswordInput.value = "";
      newPasswordInput.value = "";
      confirmPasswordInput.value = "";
      setAlert(passwordAlert, "ok", "Password changed.");
    } catch (err) {
      setAlert(passwordAlert, "error", err.message || "Could not change password.");
    } finally {
      passwordSubmit.disabled = false;
      passwordSubmit.textContent = "Change password";
    }
  }

  const timezoneForm = el("form", { novalidate: "", onsubmit: onTimezoneSubmit }, [
    timezoneAlert,
    el("div", { class: "field" }, [
      el("label", { for: "default-timezone", text: "Default timezone" }),
      timezoneSelect,
    ]),
    timezoneSubmit,
  ]);

  const passwordForm = el("form", { novalidate: "", onsubmit: onPasswordSubmit }, [
    passwordAlert,
    el("div", { class: "field" }, [
      el("label", { for: "current-password", text: "Current password" }),
      currentPasswordInput,
    ]),
    el("div", { class: "field" }, [
      el("label", { for: "new-password", text: "New password" }),
      newPasswordInput,
    ]),
    el("div", { class: "field" }, [
      el("label", { for: "confirm-password", text: "Confirm new password" }),
      confirmPasswordInput,
    ]),
    passwordSubmit,
  ]);

  const card = el("div", { class: "card settings-card" }, [
    el("h2", { text: "Settings" }),
    el("p", { class: "subtitle", text: "Manage account preferences and security." }),
    el("section", { class: "settings-section" }, [
      el("h3", { text: "Timezone" }),
      timezoneForm,
    ]),
    el("section", { class: "settings-section" }, [
      el("h3", { text: "Password" }),
      passwordForm,
    ]),
  ]);

  clear(outlet);
  outlet.append(page(card));
  loadSettings();
}
