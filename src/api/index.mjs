// API selection.
//
// The active API is decided once and remembered for the whole session:
//   - On local hosts, visiting any URL with ?api=mock sets sessionStorage
//     `api` = 'mock'.
//   - Once set, we keep using the mock API for every subsequent route,
//     even after the query param is gone (pushState navigation drops it).
//
// This lets the front end run standalone against an in-browser mock while a
// real backend does not exist yet.

import { mockApi } from "./mock.mjs";
import { realApi } from "./real.mjs";

const STORAGE_KEY = "api";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", ""]);

export function isMockAvailable() {
  return LOCAL_HOSTS.has(window.location.hostname);
}

// Read ?api=... from the current URL and, if present, persist it so the
// choice survives navigation and reloads within the session.
export function syncApiFromUrl() {
  const param = new URLSearchParams(window.location.search).get("api");
  if (param === "mock" && isMockAvailable()) {
    sessionStorage.setItem(STORAGE_KEY, param);
  } else if (param || !isMockAvailable()) {
    sessionStorage.removeItem(STORAGE_KEY);
  }
}

export function getApiMode() {
  if (!isMockAvailable()) return "real";
  return sessionStorage.getItem(STORAGE_KEY) || "real";
}

export function isMock() {
  return getApiMode() === "mock";
}

export function getApi() {
  return isMock() ? mockApi : realApi;
}
