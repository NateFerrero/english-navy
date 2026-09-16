const STORAGE_KEY = "theme";
const THEMES = ["sun", "moon", "auto"];
const media = window.matchMedia("(prefers-color-scheme: dark)");

let currentTheme = readStoredTheme();
const listeners = new Set();

function readStoredTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return THEMES.includes(stored) ? stored : "auto";
  } catch {
    return "auto";
  }
}

function writeStoredTheme(theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* localStorage can be unavailable in restrictive browser modes. */
  }
}

function resolveTheme(theme) {
  if (theme === "sun") return "light";
  if (theme === "moon") return "dark";
  return media.matches ? "dark" : "light";
}

function notify() {
  const detail = getThemeState();
  for (const listener of listeners) listener(detail);
}

export function getThemeState() {
  return {
    theme: currentTheme,
    resolvedTheme: resolveTheme(currentTheme),
  };
}

export function applyTheme() {
  const { theme, resolvedTheme } = getThemeState();
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.resolvedTheme = resolvedTheme;
  document.documentElement.style.colorScheme = resolvedTheme;
}

export function cycleTheme() {
  const next = THEMES[(THEMES.indexOf(currentTheme) + 1) % THEMES.length];
  currentTheme = next;
  writeStoredTheme(next);
  applyTheme();
  notify();
  return getThemeState();
}

export function onThemeChange(listener) {
  listeners.add(listener);
  listener(getThemeState());
  return () => listeners.delete(listener);
}

media.addEventListener("change", () => {
  if (currentTheme === "auto") {
    applyTheme();
    notify();
  }
});
