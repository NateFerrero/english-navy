const EMAIL_KEY = "session:email";
const JUST_SIGNED_UP_KEY = "session:just-signed-up";
export const TOKEN_KEY = "session:token";

export function getSessionEmail() {
  return sessionStorage.getItem(EMAIL_KEY);
}

export function setSessionEmail(email) {
  if (email) sessionStorage.setItem(EMAIL_KEY, email);
}

export function markJustSignedUp() {
  sessionStorage.setItem(JUST_SIGNED_UP_KEY, "true");
}

export function consumeJustSignedUp() {
  const value = sessionStorage.getItem(JUST_SIGNED_UP_KEY) === "true";
  sessionStorage.removeItem(JUST_SIGNED_UP_KEY);
  return value;
}

export function clearSession() {
  sessionStorage.removeItem(EMAIL_KEY);
  sessionStorage.removeItem(JUST_SIGNED_UP_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
}
