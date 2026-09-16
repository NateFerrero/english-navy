import { el, clear } from "../ui.mjs";
import { page } from "../layout.mjs";
import { navigate } from "../router.mjs";
import { getApi } from "../api/index.mjs";
import { getSessionEmail } from "../session.mjs";

function setAlert(container, kind, message) {
  clear(container);
  if (message) container.append(el("div", { class: `alert alert-${kind}`, text: message }));
}

function relationshipLabel(relationship) {
  if (relationship === "mutual") return "You can both message each other";
  if (relationship === "incoming") return "They have you as a contact";
  if (relationship === "outgoing") return "Invitation required";
  return "";
}

function invitationStatusText(invitation, meUserId) {
  if (!invitation) return "";
  if (invitation.status === "accepted") return "Accepted";
  if (invitation.status === "declined") return "Declined";
  if (invitation.status === "pending" && invitation.inviteeUserId === meUserId) return "Invitation received";
  if (invitation.status === "pending" && invitation.inviterUserId === meUserId) return "Invitation pending";
  return invitation.status;
}

export function renderMessages(outlet) {
  const email = getSessionEmail();
  if (!email) {
    navigate("/signin", { replace: true });
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const threadId = params.get("thread") || "";

  const state = {
    inbox: null,
    thread: null,
    error: "",
    success: "",
  };

  const body = el("div", { class: "profile-card-body" });
  const card = el("div", { class: "card wide-card" }, [
    el("h2", { text: "Messages" }),
    el("p", { class: "subtitle", text: "Message your contacts. Invitations require them to add you as a contact before they can reply." }),
    body,
  ]);

  function renderLoading(text) {
    clear(body);
    body.append(el("div", { class: "profile-loading", role: "status" }, [el("p", { class: "muted", text })]));
  }

  function renderInbox() {
    const alert = el("div");
    setAlert(alert, state.error ? "error" : "ok", state.error || state.success);

    const inbox = state.inbox || { threads: [], invitations: [], composeOptions: [] };

    const optionSelect = el(
      "select",
      { id: "message-target", name: "message-target" },
      [
        el("option", { value: "", text: "Choose a contact…" }),
        ...inbox.composeOptions.map((opt) =>
          el("option", {
            value: opt.userId,
            text: `${opt.email} — ${relationshipLabel(opt.relationship)}`,
          })
        ),
      ]
    );
    const optionError = el("p", { class: "error" });
    const startButton = el("button", { type: "submit", class: "btn btn-primary", text: "Start thread" });

    async function onStart(event) {
      event.preventDefault();
      optionError.textContent = "";
      const otherUserId = optionSelect.value;
      if (!otherUserId) {
        optionError.textContent = "Choose someone to message.";
        return;
      }
      startButton.disabled = true;
      startButton.textContent = "Starting...";
      try {
        const res = await getApi().createMessageThread({ otherUserId });
        navigate(`/messages?thread=${encodeURIComponent(res.threadId)}`);
      } catch (err) {
        state.error = err.message || "Could not start the thread.";
        state.success = "";
        startButton.disabled = false;
        startButton.textContent = "Start thread";
        renderInbox();
      }
    }

    function threadsList() {
      if (!inbox.threads.length) return el("p", { class: "muted", text: "No threads yet." });
      return el(
        "ul",
        { class: "entity-list" },
        inbox.threads.map((thread) =>
          el("li", { class: "entity-row entity-row-stack" }, [
            el("div", {}, [
              el("strong", { text: thread.otherUser?.email || "Unknown user" }),
              thread.lastMessage?.body ? el("span", { class: "muted", text: thread.lastMessage.body }) : el("span", { class: "muted", text: "No messages yet." }),
              thread.invitation
                ? el("span", { class: "muted", text: `Invitation: ${invitationStatusText(thread.invitation, inbox.viewerUserId)}` })
                : null,
            ]),
            el("div", { class: "row-actions" }, [
              el("a", { class: "btn btn-small btn-ghost", href: `/messages?thread=${encodeURIComponent(thread.id)}`, "data-link": "", text: "Open" }),
            ]),
          ])
        )
      );
    }

    function invitationsList() {
      if (!inbox.invitations.length) return null;
      return el("section", { class: "panel" }, [
        el("h3", { text: "Invitations" }),
        el(
          "ul",
          { class: "entity-list" },
          inbox.invitations.map((thread) =>
            el("li", { class: "entity-row entity-row-stack" }, [
              el("div", {}, [
                el("strong", { text: thread.otherUser?.email || "Unknown user" }),
                thread.lastMessage?.body ? el("span", { class: "muted", text: thread.lastMessage.body }) : el("span", { class: "muted", text: "No message preview yet." }),
              ]),
              el("div", { class: "row-actions" }, [
                el("a", { class: "btn btn-small btn-ghost", href: `/messages?thread=${encodeURIComponent(thread.id)}`, "data-link": "", text: "Preview" }),
                el("button", {
                  type: "button",
                  class: "btn btn-small btn-primary",
                  text: "Accept",
                  onclick: async () => {
                    try {
                      await getApi().respondToMessageInvitation({ invitationId: thread.invitation.id, response: "accept" });
                      await loadInbox("Invitation accepted.");
                    } catch (err) {
                      state.error = err.message || "Could not accept the invitation.";
                      state.success = "";
                      renderInbox();
                    }
                  },
                }),
                el("button", {
                  type: "button",
                  class: "btn btn-small btn-ghost",
                  text: "Decline",
                  onclick: async () => {
                    try {
                      await getApi().respondToMessageInvitation({ invitationId: thread.invitation.id, response: "decline" });
                      await loadInbox("Invitation declined.");
                    } catch (err) {
                      state.error = err.message || "Could not decline the invitation.";
                      state.success = "";
                      renderInbox();
                    }
                  },
                }),
              ]),
            ])
          )
        ),
      ]);
    }

    clear(body);
    body.append(
      alert,
      el("form", { class: "stack-form panel", novalidate: "", onsubmit: onStart }, [
        el("h3", { text: "New thread" }),
        el("div", { class: "field" }, [el("label", { for: "message-target", text: "Contact" }), optionSelect, optionError]),
        startButton,
      ]),
      ...(invitationsList() ? [invitationsList()] : []),
      el("section", { class: "panel" }, [el("h3", { text: "Threads" }), threadsList()])
    );
  }

  async function loadInbox(message = "") {
    renderLoading("Loading messages...");
    try {
      state.inbox = await getApi().listMessageInbox();
      state.error = "";
      state.success = message;
    } catch (err) {
      state.inbox = null;
      state.error = err.message || "Could not load messages.";
      state.success = "";
    }
    renderInbox();
  }

  function renderThread() {
    const alert = el("div");
    setAlert(alert, state.error ? "error" : "ok", state.error || state.success);

    const data = state.thread;
    if (!data) {
      clear(body);
      body.append(
        alert,
        el("a", { class: "btn btn-ghost", href: "/messages", "data-link": "", text: "Back" }),
        el("p", { class: "muted", text: "Thread not available." })
      );
      return;
    }

    const invitation = data.invitation;
    const canSend = Boolean(data.canSend);
    const viewerUserId = data.viewerUserId || "";
    const otherEmail = data.thread?.otherUser?.email || "Unknown user";

    async function respond(response) {
      if (!invitation?.id) return;
      try {
        await getApi().respondToMessageInvitation({ invitationId: invitation.id, response });
        await openThread(data.thread.id, response === "accept" ? "Invitation accepted." : "Invitation declined.");
      } catch (err) {
        state.error = err.message || "Could not update the invitation.";
        state.success = "";
        renderThread();
      }
    }

    const messagesList = el(
      "ul",
      { class: "entity-list message-list" },
      (data.messages || []).map((m) =>
        el("li", { class: "entity-row entity-row-stack message-row" }, [
          el("div", {}, [
            el("strong", { text: m.senderEmail || "Unknown" }),
            el("span", { class: "muted", text: m.body }),
          ]),
        ])
      )
    );

    const sendError = el("p", { class: "error" });
    const messageInput = el("textarea", { id: "message-body", name: "message-body", rows: "3", maxlength: "4000", placeholder: "Write a message…" });
    const sendButton = el("button", { type: "submit", class: "btn btn-primary", text: canSend ? "Send" : "Send (disabled)", disabled: canSend ? null : "" });

    async function onSend(event) {
      event.preventDefault();
      sendError.textContent = "";
      const text = messageInput.value.trim();
      if (!text) {
        sendError.textContent = "Message cannot be empty.";
        return;
      }
      sendButton.disabled = true;
      sendButton.textContent = "Sending...";
      try {
        await getApi().sendMessage({ threadId: data.thread.id, body: text });
        messageInput.value = "";
        await openThread(data.thread.id);
      } catch (err) {
        sendError.textContent = err.message || "Could not send the message.";
        sendButton.disabled = false;
        sendButton.textContent = "Send";
      }
    }

    const invitationPanel =
      invitation?.status === "pending" && invitation.inviteeUserId === viewerUserId
        ? el("section", { class: "panel" }, [
            el("h3", { text: "Invitation" }),
            el("p", { class: "muted", text: "You can preview the messages. To reply, accept by adding them as a contact." }),
            el("div", { class: "row-actions" }, [
              el("button", { type: "button", class: "btn btn-small btn-primary", text: "Accept", onclick: () => respond("accept") }),
              el("button", { type: "button", class: "btn btn-small btn-ghost", text: "Decline", onclick: () => respond("decline") }),
            ]),
          ])
        : invitation
          ? el("section", { class: "panel" }, [
              el("h3", { text: "Invitation" }),
              el("p", { class: "muted", text: `Status: ${invitationStatusText(invitation, viewerUserId)}` }),
            ])
          : null;

    clear(body);
    body.append(
      alert,
      el("div", { class: "row-actions" }, [
        el("a", { class: "btn btn-small btn-ghost", href: "/messages", "data-link": "", text: "Back to Messages" }),
      ]),
      el("section", { class: "panel" }, [
        el("h3", { text: otherEmail }),
        invitation?.status ? el("p", { class: "muted", text: `Invitation: ${invitation.status}` }) : null,
      ]),
      ...(invitationPanel ? [invitationPanel] : []),
      el("section", { class: "panel" }, [el("h3", { text: "Messages" }), messagesList]),
      el("form", { class: "stack-form panel", novalidate: "", onsubmit: onSend }, [
        el("h3", { text: "Send a message" }),
        el("div", { class: "field" }, [el("label", { for: "message-body", text: canSend ? "Message" : "Message (disabled)" }), messageInput, sendError]),
        sendButton,
      ])
    );
  }

  async function openThread(id, message = "") {
    renderLoading("Loading thread...");
    try {
      state.thread = await getApi().getMessageThread({ threadId: id });
      state.error = "";
      state.success = message;
    } catch (err) {
      state.thread = null;
      state.error = err.message || "Could not load the thread.";
      state.success = "";
    }
    renderThread();
  }

  clear(outlet);
  outlet.append(page(card));

  if (threadId) {
    openThread(threadId);
  } else {
    loadInbox();
  }
}

