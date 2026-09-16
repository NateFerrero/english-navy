// Real API — placeholder.
//
// There is no backend yet. Until one exists, every call fails loudly so it is
// obvious the app must be run with ?api=mock for now. When a backend lands,
// implement these methods against it (e.g. fetch to /api/...).

function notImplemented() {
  const err = new Error(
    "The real API is not available yet. Append ?api=mock to the URL to use the in-browser mock."
  );
  err.code = "NO_BACKEND";
  return Promise.reject(err);
}

export const realApi = {
  name: "real",
  signUp: notImplemented,
  listUsers: notImplemented,
};
