// In-browser mock API.
//
// Simulates a backend using sessionStorage as the "database" and a small
// artificial delay so the UI exercises its loading/async states. No network,
// no external dependencies.

import { clearSession, TOKEN_KEY } from "../session.mjs";

const USERS_KEY = "mock:users";

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadUsers() {
  try {
    return JSON.parse(sessionStorage.getItem(USERS_KEY)) || [];
  } catch {
    return [];
  }
}

function saveUsers(users) {
  sessionStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function publicUser(user) {
  return { id: user.id, email: user.email, createdAt: user.createdAt };
}

// Not cryptographic — this is a front-end-only mock. Never do this for real.
function fauxHash(password) {
  let h = 0;
  for (let i = 0; i < password.length; i++) {
    h = (h << 5) - h + password.charCodeAt(i);
    h |= 0;
  }
  return `mockhash:${h}`;
}

export const mockApi = {
  name: "mock",

  async signUp({ email, password }) {
    await delay(450);

    const normalized = String(email).trim().toLowerCase();
    const users = loadUsers();

    if (users.some((u) => u.email === normalized)) {
      const err = new Error("An account with that email already exists.");
      err.code = "EMAIL_TAKEN";
      throw err;
    }

    const user = {
      id: `usr_${Date.now().toString(36)}`,
      email: normalized,
      passwordHash: fauxHash(password),
      createdAt: new Date().toISOString(),
    };
    users.push(user);
    saveUsers(users);
    sessionStorage.setItem(TOKEN_KEY, `mock:${user.id}`);

    return publicUser(user);
  },

  async logIn({ email, password }) {
    await delay(300);

    const normalized = String(email).trim().toLowerCase();
    const passwordHash = fauxHash(password);
    const user = loadUsers().find(
      (user) => user.email === normalized && user.passwordHash === passwordHash
    );

    if (!user) {
      const err = new Error("Email or password is incorrect.");
      err.code = "INVALID_CREDENTIALS";
      throw err;
    }

    sessionStorage.setItem(TOKEN_KEY, `mock:${user.id}`);
    return publicUser(user);
  },

  async me() {
    await delay(100);

    const token = sessionStorage.getItem(TOKEN_KEY);
    const id = token?.startsWith("mock:") ? token.slice("mock:".length) : "";
    const user = loadUsers().find((user) => user.id === id);

    if (!user) {
      const err = new Error("Please sign in to continue.");
      err.code = "UNAUTHENTICATED";
      throw err;
    }

    return publicUser(user);
  },

  async listUsers() {
    await delay(100);
    return loadUsers().map(publicUser);
  },

  logOut() {
    clearSession();
  },
};
