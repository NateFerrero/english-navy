// Shared page chrome (header + nav) wrapped around each view's content.

import { el, crest } from "./ui.mjs";
import { isMock } from "./api/index.mjs";

function navLink(href, label) {
  const active = window.location.pathname === href;
  return el("a", {
    href,
    "data-link": "",
    class: active ? "active" : null,
    text: label,
  });
}

// Render the full page: a header, then the view content inside <main>.
export function page(content) {
  const nav = el("nav", { class: "nav" }, [
    navLink("/", "Home"),
    navLink("/signup", "Sign up"),
    isMock() ? el("span", { class: "badge-mock", text: "Mock API" }) : null,
  ]);

  const header = el("header", { class: "site-header" }, [
    el("div", { class: "bar" }, [
      el("a", { class: "brand", href: "/", "data-link": "" }, [
        crest(34),
        el("span", { class: "name", text: "The English Navy" }),
      ]),
      nav,
    ]),
  ]);

  const main = el("main", { id: "main" }, [content]);

  return el("div", {}, [header, main]);
}
