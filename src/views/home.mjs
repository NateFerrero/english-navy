import { el } from "../ui.mjs";
import { page } from "../layout.mjs";
import { navigate } from "../router.mjs";
import { clear } from "../ui.mjs";
import { getApi, isMock } from "../api/index.mjs";
import { clearSession, getSessionEmail } from "../session.mjs";

function renderSignedInHome(email) {
  return el("div", { class: "card account-home" }, [
    el("h2", { text: "Welcome aboard" }),
    el("p", { class: "subtitle" }, [
      "You are signed in as ",
      el("strong", { text: email }),
      ".",
    ]),
    el("div", { class: "account-actions" }, [
      el("a", {
        class: "btn btn-brass",
        href: "/profile",
        "data-link": "",
        text: "View profile",
      }),
      el("a", {
        class: "btn btn-ghost",
        href: "/settings",
        "data-link": "",
        text: "Settings",
      }),
      el("button", {
        class: "btn btn-ghost",
        type: "button",
        text: "Sign out",
        onclick: () => {
          getApi().logOut?.();
          clearSession();
          navigate("/", { replace: true });
        },
      }),
    ]),
  ]);
}

export function renderHome(outlet) {
  const email = getSessionEmail();
  if (email) {
    clear(outlet);
    outlet.append(page(renderSignedInHome(email)));
    return;
  }

  const hero = el("section", { class: "hero" }, [
    el("h1", { text: "The English Navy" }),
    el("p", {
      text: "Enlist to command the fleet. Create an account with your email and a password to get started.",
    }),
    el("div", { class: "hero-actions" }, [
      el("a", {
        class: "btn btn-brass",
        href: "/signup",
        "data-link": "",
        text: "Enlist now",
      }),
      el("a", {
        class: "btn btn-ghost",
        href: "/signin",
        "data-link": "",
        text: "Sign in",
      }),
    ]),
  ]);

  const note = el("p", { class: "mock-note" }, [
    isMock()
      ? "Running against the in-browser mock API for this session."
      : el("span", {}, [
          "Connected to the live API. Add ",
          el("code", { text: "?api=mock" }),
          " to use the in-browser mock instead.",
        ]),
  ]);

  clear(outlet);
  outlet.append(page(el("div", {}, [hero, note])));
}
