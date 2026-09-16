const STORAGE_KEY = "api";
const DEFAULT_MODE = "live";
const VALID_MODES = new Set(["mock", "live"]);

// Reads `?api=...` from the URL once at startup and persists it to
// sessionStorage. Persisting means the chosen backend survives client-side
// navigation to routes that do not carry the query param.
export function initApiMode() {
  const params = new URLSearchParams(window.location.search);
  const requested = params.get("api");
  if (requested && VALID_MODES.has(requested)) {
    sessionStorage.setItem(STORAGE_KEY, requested);
  }
  return getApiMode();
}

export function getApiMode() {
  const stored = sessionStorage.getItem(STORAGE_KEY);
  return VALID_MODES.has(stored) ? stored : DEFAULT_MODE;
}
