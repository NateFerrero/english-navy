// Authentication primitives using only Node's built-in crypto (no deps).
//
// - Passwords are hashed with scrypt + a per-password random salt.
// - Sessions are stateless HMAC-signed tokens: base64url(payload).signature.

import crypto from "node:crypto";
import { config } from "./config.mjs";

const SCRYPT_KEYLEN = 64;
const SECRET_CIPHER_PREFIX = "enc:v1:";

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password, stored) {
  const parts = String(stored).split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, expected] = parts;
  const derived = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString("hex");
  const a = Buffer.from(derived, "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

function sign(data) {
  return crypto.createHmac("sha256", config.authSecret).update(data).digest("base64url");
}

function secretKey() {
  return crypto.createHash("sha256").update(config.authSecret).digest();
}

// Encrypt high-value database credentials before storing them in the primary DB.
export function sealSecret(value) {
  if (!value) return value;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", secretKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${SECRET_CIPHER_PREFIX}${iv.toString("base64url")}.${tag.toString("base64url")}.${ciphertext.toString("base64url")}`;
}

export function unsealSecret(value) {
  if (!value || typeof value !== "string") return value;
  if (!value.startsWith(SECRET_CIPHER_PREFIX)) return value;

  const [ivText, tagText, ciphertextText] = value.slice(SECRET_CIPHER_PREFIX.length).split(".");
  if (!ivText || !tagText || !ciphertextText) return null;
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", secretKey(), Buffer.from(ivText, "base64url"));
    decipher.setAuthTag(Buffer.from(tagText, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextText, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

// Create a signed session token carrying the user id and current session version.
export function signToken(user, ttlSeconds = 60 * 60 * 24 * 7) {
  const payload = {
    uid: user.id,
    sv: Number(user.session_version || 0),
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const body = base64url(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

// Verify a token and return its payload, or null if invalid/expired.
export function verifyToken(token) {
  if (!token || typeof token !== "string") return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;

  const expectedSig = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!payload || typeof payload.uid !== "string") return null;
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}
