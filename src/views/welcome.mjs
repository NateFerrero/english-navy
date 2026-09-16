import { el, clear, crest } from "../ui.mjs";
import { page } from "../layout.mjs";
import { navigate } from "../router.mjs";
import { getSessionEmail } from "../session.mjs";
import { getApi } from "../api/index.mjs";

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

  const card = el("div", { class: "card welcome" }, [
    crestNode,
    el("div", { class: "alert alert-ok", text: "Account created. Welcome aboard!" }),
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
      list.append(
        el("li", {}, [
          el("code", { text: invite.code }),
          invite.claimedAt ? " — used" : " — unused",
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
