// Shared page chrome (header + nav) wrapped around each view's content.

import { el, crest, icon } from "./ui.mjs";
import { isMock } from "./api/index.mjs";
import { getSessionEmail } from "./session.mjs";
import { cycleTheme, onThemeChange } from "./theme.mjs";

function navLink(href, label) {
  const active = window.location.pathname === href;
  return el("a", {
    href,
    "data-link": "",
    class: active ? "active" : null,
    text: label,
  });
}

function themeButton() {
  const button = el("button", {
    class: "theme-toggle",
    type: "button",
    onclick: () => cycleTheme(),
  });
  let initialized = false;

  function render({ theme, resolvedTheme }) {
    if (initialized && !button.isConnected) {
      unsubscribe();
      return;
    }
    initialized = true;
    button.replaceChildren(icon(theme, 18));
    button.setAttribute("aria-label", `Theme: ${theme}. Click to switch theme.`);
    button.setAttribute("title", `Theme: ${theme} (${resolvedTheme})`);
  }

  const unsubscribe = onThemeChange(render);
  return button;
}

// Render the full page: a header, then the view content inside <main>.
export function page(content) {
  const email = getSessionEmail();
  const nav = el("nav", { class: "nav" }, [
    navLink("/", "Home"),
    email ? navLink("/profile", "Profile") : null,
    email ? navLink("/settings", "Settings") : null,
    email ? el("span", { class: "nav-user", text: email }) : navLink("/signin", "Sign in"),
    email ? null : navLink("/signup", "Sign up"),
    isMock() ? el("span", { class: "badge-mock", text: "Mock API" }) : null,
    themeButton(),
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
