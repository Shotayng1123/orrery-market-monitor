// Web Push without a library (Shota, 18 Nov 2026): the message encryption of RFC 8291 (content coding aes128gcm,
// RFC 8188) and the VAPID header of RFC 8292, on the WebCrypto that the Edge runtime and Node both have. No
// database here, so sim/logic.test.ts can check it against the RFC's own example.
const te = new TextEncoder();
export const b64u = (b: Uint8Array): string => { let s = ""; for (const x of b) s += String.fromCharCode(x); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
export const unb64u = (s: string): Uint8Array => { const p = s.replace(/-/g, "+").replace(/_/g, "/"); const bin = atob(p + "=".repeat((4 - (p.length % 4)) % 4)); const o = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) o[i] = bin.charCodeAt(i); return o; };
const cat = (...a: Uint8Array[]): Uint8Array => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };
const buf = (u: Uint8Array): ArrayBuffer => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey("raw", buf(ikm), "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: buf(salt), info: buf(info) }, k, len * 8));
}

export interface PushKeys { p256dh: string; auth: string }   // as a browser's subscription gives them (base64url)
/** A P-256 key as the two base64url strings a VAPID pair is usually written as: the public point (65 bytes,
 *  uncompressed) and the private scalar (32 bytes). */
export interface KeyPair { publicKey: string; privateKey: string }
const jwkOf = (k: KeyPair): JsonWebKey => { const p = unb64u(k.publicKey); if (p.length !== 65 || p[0] !== 4) throw new Error("bad public key"); return { kty: "EC", crv: "P-256", x: b64u(p.slice(1, 33)), y: b64u(p.slice(33, 65)), d: k.privateKey, ext: true }; };

/** The body of a push message for one subscription: salt, record size, the sender's one-time public key, then the
 *  payload under AES-128-GCM. `fixed` replaces the one-time key and the salt, for the RFC's example only. */
export async function encryptPush(plaintext: Uint8Array, keys: PushKeys, fixed?: { key: KeyPair; salt: Uint8Array }): Promise<Uint8Array> {
  const uaPublic = unb64u(keys.p256dh), authSecret = unb64u(keys.auth);
  if (uaPublic.length !== 65 || uaPublic[0] !== 4 || authSecret.length !== 16) throw new Error("bad subscription keys");
  if (plaintext.length > 3800) throw new Error("push payload too long");   // one 4096-byte record, less the header and the tag
  let asPrivate: CryptoKey, asPublic: Uint8Array;
  if (fixed) { asPrivate = await crypto.subtle.importKey("jwk", jwkOf(fixed.key), { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]); asPublic = unb64u(fixed.key.publicKey); }
  else { const kp = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]) as CryptoKeyPair; asPrivate = kp.privateKey; asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey) as ArrayBuffer); }
  const salt = fixed?.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const uaKey = await crypto.subtle.importKey("raw", buf(uaPublic), { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, asPrivate, 256));
  const ikm = await hkdf(authSecret, shared, cat(te.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  const cek = await hkdf(salt, ikm, te.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, te.encode("Content-Encoding: nonce\0"), 12);
  const key = await crypto.subtle.importKey("raw", buf(cek), "AES-GCM", false, ["encrypt"]);
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: buf(nonce) }, key, buf(cat(plaintext, new Uint8Array([2])))));   // 0x02 ends the last record
  return cat(salt, new Uint8Array([0, 0, 16, 0]), new Uint8Array([asPublic.length]), asPublic, sealed);
}

/** The Authorization header that tells a push service who is sending: a JWT for that service's origin, signed
 *  with the application server key, valid twelve hours. */
export async function vapidHeader(endpoint: string, key: KeyPair, subject: string, nowMs: number = Date.now()): Promise<string> {
  const k = await crypto.subtle.importKey("jwk", jwkOf(key), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const head = b64u(te.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64u(te.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(nowMs / 1000) + 12 * 3600, sub: subject })));
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, k, buf(te.encode(`${head}.${claims}`))));   // r||s, as a JWT wants
  return `vapid t=${head}.${claims}.${b64u(sig)}, k=${key.publicKey}`;
}

// Only the push services browsers actually use: the server posts to whatever address a subscription names, so an
// address is accepted only when it is one of theirs (Apple, Google FCM, Mozilla, Windows).
const PUSH_HOSTS = /(^|\.)push\.apple\.com$|^fcm\.googleapis\.com$|(^|\.)push\.services\.mozilla\.com$|(^|\.)notify\.windows\.com$/;
export function pushEndpointOk(endpoint: string): boolean {
  try { const u = new URL(endpoint); return u.protocol === "https:" && PUSH_HOSTS.test(u.hostname) && endpoint.length <= 2000; } catch { return false; }
}

export interface PushTarget { endpoint: string; p256dh: string; auth: string }
/** Sends one message. `gone`: the push service says the subscription no longer exists (the app was removed or
 *  notifications were switched off on the device), so it can be deleted. */
export async function sendPush(sub: PushTarget, payload: unknown, vapid: KeyPair, subject: string, ttlSec = 3600): Promise<{ status: number; gone: boolean }> {
  const body = await encryptPush(te.encode(JSON.stringify(payload)), sub);
  const r = await fetch(sub.endpoint, { method: "POST", headers: { "content-encoding": "aes128gcm", "content-type": "application/octet-stream", ttl: String(ttlSec), urgency: "high", authorization: await vapidHeader(sub.endpoint, vapid, subject) }, body: buf(body), signal: AbortSignal.timeout(15000) });
  await r.body?.cancel().catch(() => undefined);
  return { status: r.status, gone: r.status === 404 || r.status === 410 };
}
