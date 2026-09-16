// In-browser mock API.
//
// Simulates a backend using sessionStorage as the "database" and a small
// artificial delay so the UI exercises its loading/async states. No network,
// no external dependencies.

import { clearSession, TOKEN_KEY } from "../session.mjs";

const USERS_KEY = "mock:users";
const INVITE_CODES_KEY = "mock:invite-codes";
const LOG_KEY = "mock:activity-log";
const MAX_INVITE_CODES_PER_USER = 100;
const DEMO_INVITE_CODE = "DEMO-CODE-0001";
const INVITE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PAGE_RANK_PATHS = new Set(["/", "/profile", "/settings", "/log"]);
const DEFAULT_PROFILE = {
  display_name: "",
  first_name: "",
  last_name: "",
  bio: "",
  default_timezone: "UTC",
};

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

function publicProfile(user) {
  return { ...DEFAULT_PROFILE, display_name: user.email.split("@")[0], ...(user.profile || {}) };
}

function publicPageRanks(user) {
  return { ...(user.preferences?.pageRanks || {}) };
}

function normalizeInviteCode(code) {
  return String(code || "").trim().toUpperCase();
}

function loadInviteCodes() {
  let codes;
  try {
    codes = JSON.parse(sessionStorage.getItem(INVITE_CODES_KEY)) || [];
  } catch {
    codes = [];
  }
  if (!codes.some((invite) => invite.code === DEMO_INVITE_CODE)) {
    codes.unshift({
      code: DEMO_INVITE_CODE,
      createdByUserId: "mock_system",
      createdAt: new Date().toISOString(),
      claimedByUserId: null,
      claimedAt: null,
    });
    saveInviteCodes(codes);
  }
  return codes;
}

function saveInviteCodes(codes) {
  sessionStorage.setItem(INVITE_CODES_KEY, JSON.stringify(codes));
}

function loadLogEntries() {
  try {
    return JSON.parse(sessionStorage.getItem(LOG_KEY)) || [];
  } catch {
    return [];
  }
}

function saveLogEntries(entries) {
  sessionStorage.setItem(LOG_KEY, JSON.stringify(entries));
}

function recordLogEntry({ ownerUserId, actorUserId = ownerUserId, type, inviteCode = null, metadata = null }) {
  const entries = loadLogEntries();
  entries.unshift({
    id: `log_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    ownerUserId,
    actorUserId,
    type,
    inviteCode,
    metadata,
    createdAt: new Date().toISOString(),
  });
  saveLogEntries(entries);
}

function publicInviteCode(invite) {
  return {
    code: invite.code,
    createdAt: invite.createdAt,
    claimedAt: invite.claimedAt || null,
  };
}

function currentUserId() {
  const token = sessionStorage.getItem(TOKEN_KEY);
  return token?.startsWith("mock:") ? token.slice("mock:".length) : "";
}

function requireCurrentUser() {
  const id = currentUserId();
  const user = loadUsers().find((item) => item.id === id);
  if (!user) {
    const err = new Error("Please sign in to continue.");
    err.code = "UNAUTHENTICATED";
    throw err;
  }
  return user;
}

function randomInviteCode() {
  const parts = [];
  for (let group = 0; group < 3; group++) {
    let part = "";
    for (let i = 0; i < 4; i++) {
      part += INVITE_CODE_ALPHABET[Math.floor(Math.random() * INVITE_CODE_ALPHABET.length)];
    }
    parts.push(part);
  }
  return parts.join("-");
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

  async signUp({ email, password, inviteCode }) {
    await delay(450);

    const normalized = String(email).trim().toLowerCase();
    const normalizedInviteCode = normalizeInviteCode(inviteCode);
    const users = loadUsers();
    const inviteCodes = loadInviteCodes();

    if (users.some((u) => u.email === normalized)) {
      const err = new Error("An account with that email already exists.");
      err.code = "EMAIL_TAKEN";
      throw err;
    }
    if (!normalizedInviteCode) {
      const err = new Error("Enter an invite code.");
      err.code = "INVITE_CODE_REQUIRED";
      throw err;
    }

    const invite = inviteCodes.find(
      (item) => item.code === normalizedInviteCode && !item.claimedByUserId
    );
    if (!invite) {
      const err = new Error("Enter a valid unused invite code.");
      err.code = "INVALID_INVITE_CODE";
      throw err;
    }

    const user = {
      id: `usr_${Date.now().toString(36)}`,
      email: normalized,
      passwordHash: fauxHash(password),
      createdAt: new Date().toISOString(),
      invitedByUserId: invite.createdByUserId,
      profile: { ...DEFAULT_PROFILE, display_name: normalized.split("@")[0] },
    };
    invite.claimedByUserId = user.id;
    invite.claimedAt = new Date().toISOString();
    users.push(user);
    saveUsers(users);
    saveInviteCodes(inviteCodes);
    sessionStorage.setItem(TOKEN_KEY, `mock:${user.id}`);
    recordLogEntry({
      ownerUserId: invite.createdByUserId,
      actorUserId: user.id,
      type: "invitation_accepted",
      inviteCode: normalizedInviteCode,
      metadata: { invitedEmail: normalized },
    });

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
    recordLogEntry({ ownerUserId: user.id, type: "sign_in" });
    return publicUser(user);
  },

  async me() {
    await delay(100);

    return publicUser(requireCurrentUser());
  },

  async getProfile() {
    await delay(100);
    const user = requireCurrentUser();
    return { user: publicUser(user), profile: publicProfile(user) };
  },

  async updateProfile(updates) {
    await delay(150);
    const users = loadUsers();
    const user = users.find((item) => item.id === currentUserId());
    if (!user) {
      const err = new Error("Please sign in to continue.");
      err.code = "UNAUTHENTICATED";
      throw err;
    }

    const allowed = ["display_name", "first_name", "last_name", "bio", "default_timezone"];
    const profile = { ...publicProfile(user) };
    for (const key of allowed) {
      if (updates[key] !== undefined) profile[key] = String(updates[key]);
    }
    user.profile = profile;
    saveUsers(users);
    recordLogEntry({
      ownerUserId: user.id,
      type: "profile_change",
      metadata: {
        fields: allowed.filter((key) => updates[key] !== undefined),
      },
    });
    return { user: publicUser(user), profile };
  },

  async listPageRanks() {
    await delay(100);
    const user = requireCurrentUser();
    return { ranks: publicPageRanks(user) };
  },

  async recordPageVisit(path) {
    await delay(80);
    if (!PAGE_RANK_PATHS.has(path)) {
      const err = new Error("Unknown page rank path.");
      err.code = "INVALID_PAGE_RANK_PATH";
      throw err;
    }

    const users = loadUsers();
    const user = users.find((item) => item.id === currentUserId());
    if (!user) {
      const err = new Error("Please sign in to continue.");
      err.code = "UNAUTHENTICATED";
      throw err;
    }

    user.preferences = user.preferences || {};
    user.preferences.pageRanks = user.preferences.pageRanks || {};
    user.preferences.pageRanks[path] = Number(user.preferences.pageRanks[path] || 0) + 1;
    saveUsers(users);
    return { ranks: publicPageRanks(user) };
  },

  async resetPageRanks() {
    await delay(100);
    const users = loadUsers();
    const user = users.find((item) => item.id === currentUserId());
    if (!user) {
      const err = new Error("Please sign in to continue.");
      err.code = "UNAUTHENTICATED";
      throw err;
    }

    user.preferences = user.preferences || {};
    user.preferences.pageRanks = {};
    saveUsers(users);
    return { ranks: {} };
  },

  async changePassword({ currentPassword, newPassword }) {
    await delay(150);
    const users = loadUsers();
    const user = users.find((item) => item.id === currentUserId());
    if (!user) {
      const err = new Error("Please sign in to continue.");
      err.code = "UNAUTHENTICATED";
      throw err;
    }
    if (user.passwordHash !== fauxHash(currentPassword)) {
      const err = new Error("Current password is incorrect.");
      err.code = "INVALID_CURRENT_PASSWORD";
      throw err;
    }
    if (String(newPassword || "").length < 8) {
      const err = new Error("New password must be at least 8 characters.");
      err.code = "WEAK_PASSWORD";
      throw err;
    }

    user.passwordHash = fauxHash(newPassword);
    saveUsers(users);
    recordLogEntry({ ownerUserId: user.id, type: "password_change" });
    return { ok: true };
  },

  async listLogEntries() {
    await delay(100);
    const user = requireCurrentUser();
    const users = loadUsers();
    const entries = loadLogEntries()
      .filter((entry) => entry.ownerUserId === user.id)
      .map((entry) => ({
        id: entry.id,
        type: entry.type,
        createdAt: entry.createdAt,
        actorEmail: users.find((item) => item.id === entry.actorUserId)?.email || null,
        inviteCode: entry.inviteCode || null,
        metadata: entry.metadata || null,
      }));
    return { entries };
  },

  async listUsers() {
    await delay(100);
    return loadUsers().map(publicUser);
  },

  logOut() {
    clearSession();
  },

  async listInviteCodes() {
    await delay(100);
    const userId = currentUserId();
    const inviteCodes = loadInviteCodes().filter((invite) => invite.createdByUserId === userId);
    return {
      inviteCodes: inviteCodes.map(publicInviteCode),
      remaining: Math.max(0, MAX_INVITE_CODES_PER_USER - inviteCodes.length),
    };
  },

  async createInviteCodes({ count = 1 } = {}) {
    await delay(200);
    const userId = currentUserId();
    if (!userId) {
      const err = new Error("Sign in before creating invite codes.");
      err.code = "UNAUTHORIZED";
      throw err;
    }

    const amount = Number(count);
    if (!Number.isInteger(amount) || amount < 1 || amount > MAX_INVITE_CODES_PER_USER) {
      const err = new Error("Request between 1 and 100 invite codes.");
      err.code = "INVALID_INVITE_COUNT";
      throw err;
    }

    const inviteCodes = loadInviteCodes();
    const createdCount = inviteCodes.filter((invite) => invite.createdByUserId === userId).length;
    const remaining = MAX_INVITE_CODES_PER_USER - createdCount;
    if (amount > remaining) {
      const err = new Error(`You can create ${remaining} more invite code${remaining === 1 ? "" : "s"}.`);
      err.code = "INVITE_LIMIT_REACHED";
      throw err;
    }

    const created = [];
    while (created.length < amount) {
      const code = randomInviteCode();
      if (inviteCodes.some((invite) => invite.code === code)) continue;
      const invite = {
        code,
        createdByUserId: userId,
        createdAt: new Date().toISOString(),
        claimedByUserId: null,
        claimedAt: null,
      };
      inviteCodes.push(invite);
      created.push(invite);
    }

    saveInviteCodes(inviteCodes);
    recordLogEntry({
      ownerUserId: userId,
      type: "invite_created",
      metadata: { count: created.length },
    });
    return {
      inviteCodes: created.map(publicInviteCode),
      remaining: remaining - created.length,
    };
  },
};
