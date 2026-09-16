// Shared page chrome (header + nav) wrapped around each view's content.

import { el, crest, icon } from "./ui.mjs";
import { getApi, isMock } from "./api/index.mjs";
import { getSessionEmail } from "./session.mjs";
import { cycleTheme, onThemeChange } from "./theme.mjs";

const PAGE_RANK_CACHE_KEY = "nav:page-ranks";
const RANKED_NAV_ITEMS = [
  { href: "/", label: "Home" },
  { href: "/profile", label: "Profile" },
  { href: "/settings", label: "Settings" },
  { href: "/log", label: "Log" },
];

let navResizeController = null;

function navLink(href, label, attrs = {}) {
  const active = window.location.pathname === href;
  const className = [attrs.class, active ? "active" : null].filter(Boolean).join(" ");
  return el("a", {
    href,
    "data-link": "",
    ...attrs,
    class: className || null,
    text: label,
  });
}

function loadCachedRanks() {
  try {
    return JSON.parse(sessionStorage.getItem(PAGE_RANK_CACHE_KEY)) || {};
  } catch {
    return {};
  }
}

export function clearCachedPageRanks() {
  sessionStorage.removeItem(PAGE_RANK_CACHE_KEY);
  window.dispatchEvent(new CustomEvent("page-ranks:updated", { detail: { ranks: {} } }));
}

function cacheRanks(ranks) {
  sessionStorage.setItem(PAGE_RANK_CACHE_KEY, JSON.stringify(ranks || {}));
  window.dispatchEvent(new CustomEvent("page-ranks:updated", { detail: { ranks: ranks || {} } }));
}

function sortNavItems(ranks) {
  return RANKED_NAV_ITEMS.map((item, index) => ({ ...item, index }))
    .sort((a, b) => Number(ranks[b.href] || 0) - Number(ranks[a.href] || 0) || a.index - b.index);
}

function closeOverflow(container) {
  const button = container?.querySelector(".nav-overflow-button");
  const menu = container?.querySelector(".nav-overflow-menu");
  if (!button || !menu) return;
  button.setAttribute("aria-expanded", "false");
  menu.hidden = true;
}

function renderOverflowLink(link) {
  return navLink(link.getAttribute("href"), link.textContent, {
    class: link.classList.contains("active") ? "active" : null,
    role: "menuitem",
  });
}

function fitRankedNav(container) {
  const links = [...container.querySelectorAll(".nav-main-link")];
  const overflow = container.querySelector(".nav-overflow");
  const button = container.querySelector(".nav-overflow-button");
  const menu = container.querySelector(".nav-overflow-menu");
  if (!overflow || !button || !menu || !links.length || !container.isConnected) return;

  for (const link of links) link.hidden = false;
  overflow.hidden = true;
  menu.replaceChildren();
  closeOverflow(container);

  const gap = Number.parseFloat(getComputedStyle(container).columnGap || "0") || 0;
  const linkWidths = links.map((link) => link.offsetWidth);
  const linksWidth = linkWidths.reduce((sum, width) => sum + width, 0) + gap * Math.max(0, links.length - 1);
  const availableWidth = container.clientWidth;
  if (linksWidth <= availableWidth) return;

  overflow.hidden = false;
  overflow.style.visibility = "hidden";
  const overflowWidth = overflow.offsetWidth;
  overflow.style.visibility = "";

  let used = 0;
  let visibleCount = 0;
  const linkBudget = Math.max(0, availableWidth - overflowWidth - gap);
  for (const width of linkWidths) {
    const next = used + (visibleCount ? gap : 0) + width;
    if (next > linkBudget) break;
    used = next;
    visibleCount += 1;
  }

  const overflowLinks = links.slice(visibleCount);
  for (const link of overflowLinks) {
    link.hidden = true;
    menu.append(renderOverflowLink(link));
  }
  button.classList.toggle("active", overflowLinks.some((link) => link.classList.contains("active")));
  overflow.hidden = overflowLinks.length === 0;
}

function overflowControl() {
  const menu = el("div", { class: "nav-overflow-menu", role: "menu", hidden: "" });
  const button = el(
    "button",
    {
      class: "nav-overflow-button",
      type: "button",
      "aria-label": "More pages",
      "aria-expanded": "false",
      onclick: (event) => {
        event.stopPropagation();
        const expanded = button.getAttribute("aria-expanded") === "true";
        button.setAttribute("aria-expanded", expanded ? "false" : "true");
        menu.hidden = expanded;
        if (!expanded) {
          setTimeout(() => {
            document.addEventListener("click", () => closeOverflow(button.closest(".nav-main")), { once: true });
          });
        }
      },
    },
    [icon("caret-down", 18)]
  );
  menu.addEventListener("click", (event) => event.stopPropagation());
  return el("span", { class: "nav-overflow", hidden: "" }, [button, menu]);
}

function renderRankedNav(container, ranks) {
  const links = sortNavItems(ranks).map((item) =>
    navLink(item.href, item.label, {
      class: "nav-main-link",
      "data-nav-item": item.href,
    })
  );
  container.replaceChildren(...links, overflowControl());
  requestAnimationFrame(() => fitRankedNav(container));
}

async function recordCurrentPageVisit(path, container) {
  if (!RANKED_NAV_ITEMS.some((item) => item.href === path)) return;
  try {
    const data = await getApi().recordPageVisit?.(path);
    cacheRanks(data?.ranks || {});
  } catch {
    // Navigation should keep working even if preference storage is unavailable.
  }
  if (container.isConnected) renderRankedNav(container, loadCachedRanks());
}

function rankedNav() {
  const container = el("div", { class: "nav-main" });
  renderRankedNav(container, loadCachedRanks());
  return container;
}

function setupRankedNav(container) {
  if (navResizeController) navResizeController.abort();
  if (!container) return;
  navResizeController = new AbortController();
  window.addEventListener("resize", () => fitRankedNav(container), { signal: navResizeController.signal });
  window.addEventListener(
    "page-ranks:updated",
    (event) => {
      if (!container.isConnected) return;
      renderRankedNav(container, event.detail?.ranks || {});
    },
    { signal: navResizeController.signal }
  );
  requestAnimationFrame(() => fitRankedNav(container));
  recordCurrentPageVisit(window.location.pathname, container);
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
  const navMain = email ? rankedNav() : null;
  const nav = el("nav", { class: "nav" }, [
    email ? navMain : navLink("/", "Home"),
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

  const shell = el("div", {}, [header, main]);
  requestAnimationFrame(() => setupRankedNav(navMain));
  return shell;
}
