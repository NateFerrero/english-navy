import { el, clear } from "../ui.mjs";
import { page } from "../layout.mjs";
import { navigate } from "../router.mjs";
import { getApi } from "../api/index.mjs";
import { getSessionEmail } from "../session.mjs";

function setAlert(container, kind, message) {
  clear(container);
  if (message) container.append(el("div", { class: `alert alert-${kind}`, text: message }));
}

function invitationText(invitation) {
  const title = invitation.realmTitle || "Untitled Realm";
  const inviter = invitation.inviterEmail ? ` from ${invitation.inviterEmail}` : "";
  return `${title}${inviter}`;
}

export function renderRealms(outlet) {
  const email = getSessionEmail();
  if (!email) {
    navigate("/signin", { replace: true });
    return;
  }

  const state = {
    realms: [],
    inviteOptions: [],
    invitations: [],
    error: "",
    success: "",
  };
  const body = el("div", { class: "profile-card-body" });
  const card = el("div", { class: "card wide-card" }, [
    el("h2", { text: "Realms" }),
    el("p", { class: "subtitle", text: "Create separate Realm databases and invite Contacts to join them." }),
    body,
  ]);

  async function reload(message = "") {
    try {
      const data = await getApi().listRealms();
      state.realms = data.realms || [];
      state.inviteOptions = data.inviteOptions || [];
      state.invitations = data.invitations || [];
      state.success = message;
      state.error = "";
      window.dispatchEvent(new CustomEvent("realm-invitations:changed"));
    } catch (err) {
      state.error = err.message || "Could not load Realms.";
      state.success = "";
    }
    render();
  }

  function createRealmForm() {
    const titleInput = el("input", { id: "realm-title", name: "realm-title", type: "text", maxlength: "80" });
    const descriptionInput = el("textarea", {
      id: "realm-description",
      name: "realm-description",
      rows: "3",
      maxlength: "500",
    });
    const submit = el("button", { type: "submit", class: "btn btn-primary", text: "Create Realm" });
    const formError = el("p", { class: "error" });

    async function onSubmit(event) {
      event.preventDefault();
      const title = titleInput.value.trim();
      if (!title) {
        formError.textContent = "Enter a Realm title.";
        return;
      }
      submit.disabled = true;
      submit.textContent = "Creating...";
      try {
        await getApi().createRealm({ title, description: descriptionInput.value.trim() });
        await reload("Realm created.");
      } catch (err) {
        state.error = err.message || "Could not create the Realm.";
        state.success = "";
        render();
      }
    }

    return el("form", { class: "stack-form panel", novalidate: "", onsubmit: onSubmit }, [
      el("h3", { text: "New Realm" }),
      el("div", { class: "field" }, [el("label", { for: "realm-title", text: "Title" }), titleInput, formError]),
      el("div", { class: "field" }, [
        el("label", { for: "realm-description", text: "Description" }),
        descriptionInput,
      ]),
      submit,
    ]);
  }

  function pendingInvitations() {
    if (!state.invitations.length) return null;
    return el("section", { class: "panel" }, [
      el("h3", { text: "Invitations" }),
      el(
        "ul",
        { class: "entity-list" },
        state.invitations.map((invitation) =>
          el("li", { class: "entity-row entity-row-stack" }, [
            el("div", {}, [
              el("strong", { text: invitationText(invitation) }),
              invitation.realmDescription ? el("span", { class: "muted", text: invitation.realmDescription }) : null,
            ]),
            el("div", { class: "row-actions" }, [
              el("button", {
                type: "button",
                class: "btn btn-small btn-primary",
                text: "Accept",
                onclick: () => respond(invitation.id, "accept"),
              }),
              el("button", {
                type: "button",
                class: "btn btn-small btn-ghost",
                text: "Decline",
                onclick: () => respond(invitation.id, "decline"),
              }),
            ]),
          ])
        )
      ),
    ]);
  }

  async function respond(invitationId, response) {
    try {
      await getApi().respondToRealmInvitation({ invitationId, response });
      await reload(response === "accept" ? "Invitation accepted." : "Invitation declined.");
    } catch (err) {
      state.error = err.message || "Could not update the invitation.";
      state.success = "";
      render();
    }
  }

  function inviteForm(realm) {
    if (realm.role !== "owner") return null;
    const emailInput = el("input", {
      type: "email",
      list: `realm-invite-options-${realm.id}`,
      placeholder: "contact@example.com",
      "aria-label": `Invite email for ${realm.title}`,
    });
    const submit = el("button", { type: "submit", class: "btn btn-small btn-ghost", text: "Invite" });
    const formError = el("span", { class: "inline-error" });

    async function onSubmit(event) {
      event.preventDefault();
      formError.textContent = "";
      submit.disabled = true;
      submit.textContent = "Inviting...";
      try {
        await getApi().inviteToRealm({ realmId: realm.id, email: emailInput.value.trim() });
        await reload("Realm invitation sent.");
      } catch (err) {
        formError.textContent = err.message || "Could not send invitation.";
        submit.disabled = false;
        submit.textContent = "Invite";
      }
    }

    return el("form", { class: "inline-form", onsubmit: onSubmit }, [
      emailInput,
      el(
        "datalist",
        { id: `realm-invite-options-${realm.id}` },
        state.inviteOptions.map((option) => el("option", { value: option.email }))
      ),
      submit,
      formError,
    ]);
  }

  function realmsList() {
    if (!state.realms.length) return el("p", { class: "muted", text: "No Realms yet." });
    return el(
      "ul",
      { class: "entity-list realm-list" },
      state.realms.map((realm) =>
        el("li", { class: "entity-row entity-row-stack" }, [
          el("div", {}, [
            el("strong", { text: realm.title }),
            realm.description ? el("span", { class: "muted", text: realm.description }) : null,
            el("span", {
              class: "muted",
              text: `${realm.role === "owner" ? "Owner" : "Member"} - ${realm.memberCount} member${
                realm.memberCount === 1 ? "" : "s"
              }`,
            }),
          ]),
          inviteForm(realm),
        ])
      )
    );
  }

  function render() {
    const alert = el("div");
    const invitations = pendingInvitations();
    setAlert(alert, state.error ? "error" : "ok", state.error || state.success);
    clear(body);
    body.append(
      alert,
      createRealmForm(),
      ...(invitations ? [invitations] : []),
      el("section", { class: "panel" }, [el("h3", { text: "Your Realms" }), realmsList()])
    );
  }

  clear(outlet);
  outlet.append(page(card));
  body.append(el("div", { class: "profile-loading", role: "status" }, [el("p", { class: "muted", text: "Loading Realms..." })]));
  reload();
}
