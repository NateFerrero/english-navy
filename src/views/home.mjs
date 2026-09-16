import { el } from "../ui.mjs";
import { page } from "../layout.mjs";
import { clear } from "../ui.mjs";
import { isMock } from "../api/index.mjs";

export function renderHome(outlet) {
  const hero = el("section", { class: "hero" }, [
    el("h1", { text: "The English Navy" }),
    el("p", {
      text: "Enlist to command the fleet. Create an account with your email and a password to get started.",
    }),
    el("a", {
      class: "btn btn-brass",
      href: "/signup",
      "data-link": "",
      text: "Enlist now",
    }),
  ]);

  const note = el("p", { class: "mock-note" }, [
    isMock()
      ? "Running against the in-browser mock API for this session."
      : el("span", {}, [
          "No backend yet — open ",
          el("code", { text: "?api=mock" }),
          " to try the mock sign-up flow.",
        ]),
  ]);

  clear(outlet);
  outlet.append(page(el("div", {}, [hero, note])));
}
