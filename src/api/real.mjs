// Real API — talks to the backend serverless functions under /api.
//
// Mirrors the mock API's interface so views work unchanged in either mode.
// The backend keeps the real session in an HttpOnly SameSite cookie.

import { clearSession } from "../session.mjs";

async function request(path, { method = "GET", body, auth = false } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let res;
  try {
    res = await fetch(path, {
      method,
      headers,
      credentials: "same-origin",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    const err = new Error("Could not reach the server. Please try again.");
    err.code = "NETWORK";
    throw err;
  }

  let data = {};
  try {
    data = await res.json();
  } catch {
    /* empty / non-JSON body */
  }

  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status}).`);
    err.code = data.code || `HTTP_${res.status}`;
    throw err;
  }
  return data;
}

export const realApi = {
  name: "real",

  async signUp({ email, password, inviteCode }) {
    const data = await request("/api/signup", {
      method: "POST",
      body: { email, password, inviteCode },
    });
    return data.user;
  },

  async logIn({ email, password }) {
    const data = await request("/api/login", {
      method: "POST",
      body: { email, password },
    });
    return data.user;
  },

  async me() {
    const data = await request("/api/me", { auth: true });
    return data.user;
  },

  async getProfile() {
    return request("/api/profile", { auth: true });
  },

  async updateProfile(updates) {
    return request("/api/profile", { method: "PUT", auth: true, body: updates });
  },

  async changePassword({ currentPassword, newPassword }) {
    return request("/api/password", {
      method: "PUT",
      auth: true,
      body: { currentPassword, newPassword },
    });
  },

  async listLogEntries() {
    return request("/api/log", { auth: true });
  },

  async listInviteCodes() {
    const data = await request("/api/invite-codes", { auth: true });
    return data;
  },

  async createInviteCodes({ count = 1 } = {}) {
    const data = await request("/api/invite-codes", {
      method: "POST",
      auth: true,
      body: { count },
    });
    return data;
  },

  async listUsers() {
    // Not exposed by the backend; kept for interface parity with the mock.
    const err = new Error("Listing users is not supported by the real API.");
    err.code = "UNSUPPORTED";
    throw err;
  },

  async logOut() {
    try {
      await request("/api/me", { method: "DELETE" });
    } catch {
      // Local UI state should still clear if the server session is already gone.
    }
    clearSession();
  },
};
