import { el, clear, crest, icon } from "../ui.mjs";
import { page } from "../layout.mjs";
import { navigate } from "../router.mjs";
import { consumeJustSignedUp, getSessionEmail } from "../session.mjs";
import { getApi } from "../api/index.mjs";

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = el("textarea", { class: "copy-buffer" });
  textarea.value = value;
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Copy failed.");
}

export function renderWelcome(outlet) {
  const email = getSessionEmail();

  // If someone lands here directly without signing up, send them to sign in.
  if (!email) {
    navigate("/signin", { replace: true });
    return;
  }

  const crestNode = crest(96);
  crestNode.classList.add("crest-lg");
  const invitePanel = renderInvitePanel();
  const justSignedUp = consumeJustSignedUp();

  const signupAlert = justSignedUp
    ? el("div", { class: "alert alert-ok alert-dismissible" }, [
        el("span", { text: "Account created. Welcome aboard!" }),
        el("button", {
          class: "alert-dismiss",
          type: "button",
          "aria-label": "Dismiss notification",
          onclick: (event) => event.currentTarget.closest(".alert")?.remove(),
        }, [icon("x", 18)]),
      ])
    : null;

  const card = el("div", { class: "card welcome" }, [
    crestNode,
    signupAlert,
    el("h2", { text: "Ahoy, sailor!" }),
    el("p", { class: "muted" }, ["You are enlisted as ", el("strong", { text: email }), "."]),
    invitePanel,
    el("button", {
      class: "btn btn-ghost",
      text: "Back to home",
      onclick: () => navigate("/"),
    }),
  ]);

  clear(outlet);
  outlet.append(page(card));
}

function renderInvitePanel() {
  const status = el("div", { class: "invite-status muted" });
  const list = el("ul", { class: "invite-list" });
  const countInput = el("input", {
    id: "invite-count",
    name: "invite-count",
    type: "number",
    min: "1",
    max: "100",
    value: "1",
  });
  const createButton = el("button", {
    class: "btn btn-primary",
    type: "button",
    text: "Create invite code",
  });

  function renderCodes(inviteCodes) {
    clear(list);
    if (!inviteCodes.length) {
      list.append(el("li", { class: "muted", text: "No invite codes created yet." }));
      return;
    }
    for (const invite of inviteCodes) {
      const isUnused = !invite.claimedAt;
      list.append(
        el("li", { class: "invite-row" }, [
          el("span", { class: "invite-code-meta" }, [
            el("code", { text: invite.code }),
            isUnused ? " — unused" : " — used",
          ]),
          isUnused
            ? el("button", {
                class: "copy-button",
                type: "button",
                "aria-label": `Copy invite code ${invite.code}`,
                title: "Copy invite code",
                onclick: async () => {
                  try {
                    await copyText(invite.code);
                    status.textContent = `Copied ${invite.code}.`;
                  } catch {
                    status.textContent = "Could not copy invite code.";
                  }
                },
              }, [icon("copy", 18)])
            : null,
        ])
      );
    }
  }

  async function refreshInvites() {
    try {
      const data = await getApi().listInviteCodes();
      renderCodes(data.inviteCodes);
      status.textContent = `${data.remaining} invite code${data.remaining === 1 ? "" : "s"} remaining.`;
    } catch (err) {
      status.textContent = err.message || "Could not load invite codes.";
    }
  }

  createButton.addEventListener("click", async () => {
    createButton.disabled = true;
    createButton.textContent = "Creating…";
    status.textContent = "";
    try {
      const data = await getApi().createInviteCodes({ count: Number(countInput.value) });
      await refreshInvites();
      status.textContent = `Created ${data.inviteCodes.length} invite code${
        data.inviteCodes.length === 1 ? "" : "s"
      }. ${data.remaining} remaining.`;
    } catch (err) {
      status.textContent = err.message || "Could not create invite codes.";
    } finally {
      createButton.disabled = false;
      createButton.textContent = "Create invite code";
    }
  });

  const panel = el("section", { class: "invite-panel" }, [
    el("h3", { text: "Invite your crew" }),
    el("p", {
      class: "muted",
      text: "Create up to 100 invite codes for future signups.",
    }),
    el("div", { class: "invite-controls" }, [
      el("label", { for: "invite-count", text: "Codes to create" }),
      countInput,
      createButton,
    ]),
    status,
    list,
  ]);

  refreshInvites();
  return panel;
}
