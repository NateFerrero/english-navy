// PushState-based client router. No hash in the URL.
//
// - Registered routes map a pathname to a render function.
// - In-app navigation uses history.pushState (via navigate() or by clicking any
//   <a data-link href="/path">), so the address bar shows a clean path and no #.
// - Back/forward buttons work via the popstate event.
// - The server serves index.html for unknown paths so a hard refresh on any
//   route still boots the app (SPA fallback).

const routes = new Map();
let notFoundHandler = null;
let outlet = null;

export function registerRoute(path, handler) {
  routes.set(path, handler);
}

export function setNotFound(handler) {
  notFoundHandler = handler;
}

// Programmatic navigation.
export function navigate(path, { replace = false } = {}) {
  if (replace) {
    window.history.replaceState({}, "", path);
  } else {
    window.history.pushState({}, "", path);
  }
  render();
}

function render() {
  const path = window.location.pathname;
  const handler = routes.get(path) || notFoundHandler;
  if (!handler || !outlet) return;
  handler(outlet);
  window.scrollTo(0, 0);
}

// Intercept clicks on same-origin links marked with data-link.
function onClick(event) {
  const link = event.target.closest("a[data-link]");
  if (!link) return;
  const href = link.getAttribute("href");
  if (!href || href.startsWith("http")) return;
  // Let modified clicks (new tab, etc.) behave normally.
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

  event.preventDefault();
  if (href !== window.location.pathname) navigate(href);
}

export function startRouter(rootNode) {
  outlet = rootNode;
  document.addEventListener("click", onClick);
  window.addEventListener("popstate", render);
  render();
}
