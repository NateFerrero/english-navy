import { el, clear } from "../ui.mjs";
import { page } from "../layout.mjs";

export function renderNotFound(outlet) {
  const card = el("div", { class: "card welcome" }, [
    el("h2", { text: "Off the charts" }),
    el("p", { class: "muted", text: "That course leads nowhere. No such page." }),
    el("a", { class: "btn btn-ghost", href: "/", "data-link": "", text: "Back to home" }),
  ]);

  clear(outlet);
  outlet.append(page(card));
}
