// Real API — talks to the backend serverless functions under /api.
//
// Mirrors the mock API's interface so views work unchanged in either mode.
// The session token returned by sign-up / login is kept in sessionStorage and
// sent as a Bearer token on authenticated requests.

const TOKEN_KEY = "session:token";

function getToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}

function setToken(token) {
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
}

async function request(path, { method = "GET", body, auth = false } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth) {
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  let res;
  try {
    res = await fetch(path, {
      method,
      headers,
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

  async signUp({ email, password }) {
    const data = await request("/api/signup", {
      method: "POST",
      body: { email, password },
    });
    setToken(data.token);
    return data.user;
  },

  async logIn({ email, password }) {
    const data = await request("/api/login", {
      method: "POST",
      body: { email, password },
    });
    setToken(data.token);
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

  async listUsers() {
    // Not exposed by the backend; kept for interface parity with the mock.
    const err = new Error("Listing users is not supported by the real API.");
    err.code = "UNSUPPORTED";
    throw err;
  },
};
