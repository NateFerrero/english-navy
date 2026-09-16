const EMAIL_KEY = "session:email";
export const TOKEN_KEY = "session:token";

export function getSessionEmail() {
  return sessionStorage.getItem(EMAIL_KEY);
}

export function setSessionEmail(email) {
  if (email) sessionStorage.setItem(EMAIL_KEY, email);
}

export function clearSession() {
  sessionStorage.removeItem(EMAIL_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
}
