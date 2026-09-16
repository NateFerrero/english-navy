import { el, clear, crest } from "../ui.mjs";
import { page } from "../layout.mjs";
import { navigate } from "../router.mjs";
import { getSessionEmail } from "../session.mjs";

export function renderWelcome(outlet) {
  const email = getSessionEmail();

  // If someone lands here directly without signing up, send them to sign in.
  if (!email) {
    navigate("/signin", { replace: true });
    return;
  }

  const crestNode = crest(96);
  crestNode.classList.add("crest-lg");

  const card = el("div", { class: "card welcome" }, [
    crestNode,
    el("div", { class: "alert alert-ok", text: "Account created. Welcome aboard!" }),
    el("h2", { text: "Ahoy, sailor!" }),
    el("p", { class: "muted" }, ["You are enlisted as ", el("strong", { text: email }), "."]),
    el("button", {
      class: "btn btn-ghost",
      text: "Back to home",
      onclick: () => navigate("/"),
    }),
  ]);

  clear(outlet);
  outlet.append(page(card));
}
