// Monitor sign-in tokens: base64url(JSON{id, iat, exp}) + "." + base64url(HMAC-SHA256). Secret: MONITOR_TOKEN_SECRET.
import { timingSafeEqual } from "./http.ts";

const enc = new TextEncoder();
const b64url = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64url = (s: string): Uint8Array => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=")), (c) => c.charCodeAt(0));

async function key(): Promise<CryptoKey> {
  const secret = Deno.env.get("MONITOR_TOKEN_SECRET");
  if (!secret || secret.length < 16) throw new Error("MONITOR_TOKEN_SECRET is not set");
  return await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export interface TokenPayload { id: string; iat: number; exp: number }

export async function signToken(id: string, ttlSec: number): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const body = b64url(enc.encode(JSON.stringify({ id, iat: now, exp: now + ttlSec } satisfies TokenPayload)));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await key(), enc.encode(body)));
  return `${body}.${b64url(sig)}`;
}

export async function verifyToken(token: string | null): Promise<TokenPayload | null> {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  try {
    const expected = b64url(new Uint8Array(await crypto.subtle.sign("HMAC", await key(), enc.encode(body))));
    if (!timingSafeEqual(expected, sig)) return null;
    const p = JSON.parse(new TextDecoder().decode(unb64url(body))) as TokenPayload;
    if (!p.id || typeof p.exp !== "number" || p.exp * 1000 < Date.now()) return null;
    return p;
  } catch { return null; }
}

export const bearer = (req: Request): string | null => { const a = req.headers.get("authorization") ?? ""; return a.startsWith("Bearer ") ? a.slice(7).trim() : null; };
