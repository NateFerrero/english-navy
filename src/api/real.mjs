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

  async listPageRanks() {
    return request("/api/profile?pageRank=list", { auth: true });
  },

  async recordPageVisit(path) {
    return request("/api/profile?pageRank=record", {
      method: "POST",
      auth: true,
      body: { path },
    });
  },

  async resetPageRanks() {
    return request("/api/profile?pageRank=reset", { method: "POST", auth: true });
  },

  async listContacts() {
    return request("/api/contacts", { auth: true });
  },

  async addContact({ email }) {
    return request("/api/contacts", { method: "POST", auth: true, body: { email } });
  },

  async listMessageInbox() {
    return request("/api/messages", { auth: true });
  },

  async createMessageThread({ otherUserId }) {
    return request("/api/messages?action=thread", { method: "POST", auth: true, body: { otherUserId } });
  },

  async getMessageThread({ threadId }) {
    return request(`/api/messages?action=thread&id=${encodeURIComponent(threadId)}`, { auth: true });
  },

  async sendMessage({ threadId, body }) {
    return request("/api/messages?action=send", { method: "POST", auth: true, body: { threadId, body } });
  },

  async respondToMessageInvitation({ invitationId, response }) {
    return request("/api/messages?action=respond", { method: "POST", auth: true, body: { invitationId, response } });
  },

  async listRealms() {
    return request("/api/realms", { auth: true });
  },

  async createRealm({ title, description }) {
    return request("/api/realms", { method: "POST", auth: true, body: { title, description } });
  },

  async inviteToRealm({ realmId, email }) {
    return request("/api/realms?action=invite", {
      method: "POST",
      auth: true,
      body: { realmId, email },
    });
  },

  async listRealmNotifications() {
    return request("/api/realms?action=notifications", { auth: true });
  },

  async respondToRealmInvitation({ invitationId, response }) {
    return request("/api/realms?action=respond", {
      method: "POST",
      auth: true,
      body: { invitationId, response },
    });
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
