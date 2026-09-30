// PushState-based client router. No hash in the URL.
//
// - Registered routes map a pathname to a render function.
// - In-app navigation uses history.pushState (via navigate() or by clicking any
//   <a data-link href="/path">), so the address bar shows a clean path and no #.
// - Back/forward buttons work via the popstate event.
// - The server serves index.html for unknown paths so a hard refresh on any
//   route still boots the app (SPA fallback).

const routes = new Map();
const paramRoutes = [];
let notFoundHandler = null;
let outlet = null;

function compilePattern(pattern) {
  const keys = [];
  const regex = new RegExp(
    `^${pattern
      .split("/")
      .map((segment) => {
        if (segment.startsWith(":")) {
          keys.push(segment.slice(1));
          return "([^/]+)";
        }
        return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      })
      .join("/")}$`
  );
  return { regex, keys };
}

export function registerRoute(path, handler) {
  routes.set(path, handler);
  if (path.includes(":")) paramRoutes.push({ ...compilePattern(path), handler });
}

function matchRoute(pathname) {
  if (routes.has(pathname)) return { handler: routes.get(pathname), params: {} };
  for (const route of paramRoutes) {
    const match = pathname.match(route.regex);
    if (!match) continue;
    const params = {};
    route.keys.forEach((key, index) => {
      params[key] = decodeURIComponent(match[index + 1]);
    });
    return { handler: route.handler, params };
  }
  return { handler: notFoundHandler, params: {} };
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
  const { handler, params } = matchRoute(path);
  if (!handler || !outlet) return;
  handler(outlet, params);
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
  const next = new URL(href, window.location.origin);
  const current = `${window.location.pathname}${window.location.search}`;
  const target = `${next.pathname}${next.search}`;
  if (target !== current) navigate(href);
}

export function startRouter(rootNode) {
  outlet = rootNode;
  document.addEventListener("click", onClick);
  window.addEventListener("popstate", render);
  render();
}
