import { el, clear } from "../ui.mjs";
import { page } from "../layout.mjs";
import { navigate } from "../router.mjs";
import { getApi } from "../api/index.mjs";
import { getSessionEmail } from "../session.mjs";

const EVENT_LABELS = {
  sign_in: "Signed in",
  profile_change: "Profile changed",
  password_change: "Password changed",
  invite_created: "Invite created",
  invitation_accepted: "Invitation accepted",
};

const FIELD_LABELS = {
  display_name: "display name",
  first_name: "first name",
  last_name: "last name",
  bio: "bio",
  default_timezone: "default timezone",
};

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function describeEntry(entry) {
  if (entry.type === "profile_change") {
    const fields = entry.metadata?.fields || [];
    if (fields.length) {
      return `Updated ${fields.map((field) => FIELD_LABELS[field] || field).join(", ")}.`;
    }
    return "Updated profile details.";
  }

  if (entry.type === "invite_created") {
    const count = Number(entry.metadata?.count || 1);
    return `Created ${count} invite code${count === 1 ? "" : "s"}.`;
  }

  if (entry.type === "invitation_accepted") {
    const who = entry.actorEmail || entry.metadata?.invitedEmail || "A new sailor";
    const suffix = entry.inviteCode ? ` with ${entry.inviteCode}` : "";
    return `${who} accepted an invitation${suffix}.`;
  }

  if (entry.type === "password_change") return "Changed account password.";
  if (entry.type === "sign_in") return "Signed in to this account.";
  return "Account activity recorded.";
}

function renderEntry(entry) {
  return el("li", { class: "log-entry" }, [
    el("div", { class: "log-entry-main" }, [
      el("strong", { text: EVENT_LABELS[entry.type] || entry.type }),
      el("span", { text: describeEntry(entry) }),
    ]),
    el("time", { datetime: entry.createdAt, text: formatDate(entry.createdAt) }),
  ]);
}

export function renderLog(outlet) {
  const email = getSessionEmail();
  if (!email) {
    navigate("/signin", { replace: true });
    return;
  }

  const body = el("div", { class: "log-body" });
  const card = el("div", { class: "card log-card" }, [
    el("h2", { text: "Log" }),
    el("p", {
      class: "subtitle",
      text: "Review sign-ins, profile edits, password changes, invite creation, and accepted invitations.",
    }),
    body,
  ]);

  function renderLoading() {
    clear(body);
    body.append(el("p", { class: "muted", role: "status", text: "Loading log..." }));
  }

  function renderError(message) {
    clear(body);
    body.append(
      el("div", { class: "alert alert-error", text: message }),
      el("button", {
        type: "button",
        class: "btn btn-primary",
        text: "Retry loading log",
        onclick: loadLog,
      }),
    );
  }

  function renderEntries(entries) {
    clear(body);
    if (!entries.length) {
      body.append(el("p", { class: "muted", text: "No account activity has been recorded yet." }));
      return;
    }
    body.append(el("ul", { class: "log-list" }, entries.map(renderEntry)));
  }

  async function loadLog() {
    renderLoading();
    try {
      const data = await getApi().listLogEntries();
      renderEntries(data.entries || []);
    } catch (err) {
      renderError(err.message || "Could not load your log.");
    }
  }

  clear(outlet);
  outlet.append(page(card));
  loadLog();
}
