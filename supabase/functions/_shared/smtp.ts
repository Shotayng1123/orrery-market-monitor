// The smallest SMTP client that does the Monitor's one job: hand one message to a mail server over a connection
// that is encrypted from the first byte (port 465), signing in with a user name and a password (for Gmail: the
// address and an app password). Supabase does not let a function reach ports 25 and 587, which is why only the
// encrypted-from-the-start kind is spoken here (no STARTTLS).
// The conversation (smtpTalk) and the message (buildMessage) take no network of their own, so both are checked in
// sim/logic.test.ts against a scripted server; smtpSend is the thin part that opens the real connection.
export interface Address { name: string; email: string }
export interface Message { from: Address; to: string; subject: string; text: string; html?: string }
export interface SmtpConfig { host: string; port: number; user: string; pass: string }
/** One side of the connection as text: read() gives the next piece (null once the server has hung up). */
export interface Wire { read(): Promise<string | null>; write(s: string): Promise<void> }

const enc = new TextEncoder();
const ADDR = /^[^\s<>"(),;:\\@]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;
const b64 = (s: string): string => { const b = enc.encode(s); let t = ""; for (let i = 0; i < b.length; i += 0x8000) t += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(t); };
const ascii = (s: string): boolean => /^[\x20-\x7e]*$/.test(s);

/** "Orrery Monitor <notes@example.com>" or a bare address; null when it is neither. */
export function parseFrom(v: string): Address | null {
  const s = v.trim();
  const m = /^(.*?)<\s*([^<>\s]+)\s*>$/.exec(s);
  const email = (m ? m[2] : s).toLowerCase();
  if (!ADDR.test(email)) return null;
  return { name: m ? m[1].trim().replace(/^"(.*)"$/, "$1").trim() : "", email };
}

/** A header value with characters beyond ASCII, as RFC 2047 "encoded words" of at most 45 bytes each. */
function encodedWords(s: string): string {
  const out: string[] = []; let cur = "";
  for (const ch of s) { if (enc.encode(cur + ch).length > 45) { out.push(cur); cur = ""; } cur += ch; }
  if (cur) out.push(cur);
  return out.map((w) => `=?UTF-8?B?${b64(w)}?=`).join("\r\n ");
}
const headerText = (s: string): string => { const one = s.replace(/[\r\n]+/g, " ").trim(); return ascii(one) ? one : encodedWords(one); };
const nameText = (s: string): string => { const one = s.replace(/[\r\n]+/g, " ").trim(); return !one ? "" : ascii(one) ? `"${one.replace(/["\\]/g, "")}" ` : `${encodedWords(one)} `; };
const body64 = (s: string): string => (b64(s.replace(/\r?\n/g, "\r\n")).match(/.{1,76}/g) ?? []).join("\r\n");

/** The message as it goes on the wire: headers, then the text (and the HTML version beside it when given),
 *  both base64 so no line is too long and nothing in them can be read as a command. Lines end with CR LF. */
export function buildMessage(m: Message, now: Date, id: string): string {
  if (!ADDR.test(m.from.email) || !ADDR.test(m.to)) throw new Error("not an email address");
  const head = [
    `From: ${nameText(m.from.name)}<${m.from.email}>`,
    `To: <${m.to}>`,
    `Subject: ${headerText(m.subject)}`,
    `Date: ${now.toUTCString().replace(/GMT$/, "+0000")}`,
    `Message-ID: <${id}@${m.from.email.split("@")[1]}>`,
    "MIME-Version: 1.0",
    "Auto-Submitted: auto-generated",
  ];
  const part = (type: string, s: string) => [`Content-Type: ${type}; charset=utf-8`, "Content-Transfer-Encoding: base64", "", body64(s)];
  if (!m.html) return [...head, ...part("text/plain", m.text)].join("\r\n") + "\r\n";
  const bound = `=_orrery_${id}`;
  return [...head, `Content-Type: multipart/alternative; boundary="${bound}"`, "", `--${bound}`, ...part("text/plain", m.text), `--${bound}`, ...part("text/html", m.html), `--${bound}--`].join("\r\n") + "\r\n";
}

/** A line of the message that starts with a dot gets a second one, so a lone dot can only be the end mark. */
export const dotStuff = (data: string): string => data.replace(/^\./gm, "..");

export class SmtpError extends Error {
  constructor(public step: string, public code: number, public reply: string) { super(`the mail server refused ${step}: ${code} ${reply}`.slice(0, 400)); }
}

/** One message, start to finish, over an open connection. Returns the server's answer to the message itself
 *  (for Gmail: "2.0.0 OK …"). Throws SmtpError with the server's own words when a step is refused. */
export async function smtpTalk(w: Wire, cfg: Pick<SmtpConfig, "user" | "pass">, from: string, to: string, data: string): Promise<string> {
  if (!ADDR.test(from) || !ADDR.test(to)) throw new Error("not an email address");
  let buf = "";
  const reply = async (): Promise<{ code: number; lines: string[] }> => {
    const lines: string[] = [];
    for (;;) {
      let i: number;
      while ((i = buf.indexOf("\n")) < 0) {
        const piece = await w.read();
        if (piece == null) throw new Error("the mail server closed the connection");
        buf += piece;
        if (buf.length > 65536) throw new Error("the mail server's answer is too long");
      }
      const line = buf.slice(0, i).replace(/\r$/, "");
      buf = buf.slice(i + 1);
      const m = /^(\d{3})([ -]?)(.*)$/.exec(line);
      if (!m) throw new Error(`unexpected answer from the mail server: ${line.slice(0, 200)}`);
      lines.push(m[3]);
      if (m[2] !== "-") return { code: Number(m[1]), lines };
    }
  };
  const expect = async (step: string, ...want: number[]) => { const r = await reply(); if (!want.includes(r.code)) throw new SmtpError(step, r.code, r.lines.join(" ")); return r; };
  const say = async (line: string, step: string, ...want: number[]) => { await w.write(line + "\r\n"); return await expect(step, ...want); };

  await expect("the connection", 220);
  const hello = await say("EHLO [127.0.0.1]", "the greeting", 250);
  const auth = (hello.lines.find((l) => /^AUTH[ =]/i.test(l)) ?? "").toUpperCase();
  if (!auth || /\bPLAIN\b/.test(auth)) await say(`AUTH PLAIN ${b64(`\0${cfg.user}\0${cfg.pass}`)}`, "the sign-in", 235);
  else if (/\bLOGIN\b/.test(auth)) { await say("AUTH LOGIN", "the sign-in", 334); await say(b64(cfg.user), "the sign-in", 334); await say(b64(cfg.pass), "the sign-in", 235); }
  else throw new Error(`the mail server offers no sign-in this client knows (${auth})`);
  await say(`MAIL FROM:<${from}>`, "the sender", 250);
  await say(`RCPT TO:<${to}>`, "the recipient", 250, 251);
  await say("DATA", "the message", 354);
  const done = await say(dotStuff(data.endsWith("\r\n") ? data : data + "\r\n") + ".", "the message", 250);
  try { await w.write("QUIT\r\n"); } catch { /* the message is already accepted */ }
  return done.lines.join(" ");
}

/** A Gmail app password is shown as four groups of four letters; the spaces are not part of it. */
export const appPassword = (p: string): string => (/^([a-z]{4}\s){3}[a-z]{4}$/.test(p.trim()) ? p.replace(/\s/g, "") : p);

/** Opens the encrypted connection and sends the message. Gives up after `timeoutMs`, whichever step is slow. */
export async function smtpSend(cfg: SmtpConfig, m: Message, timeoutMs = 20000): Promise<string> {
  let conn: Deno.TlsConn | null = null, late = false, timer: ReturnType<typeof setTimeout> | undefined;
  const opening = Deno.connectTls({ hostname: cfg.host, port: cfg.port });
  opening.then((c) => { if (late) { try { c.close(); } catch { /* already closed */ } } }, () => undefined);   // a connection that opens after the wait is over is closed, not left open
  const giveUp = new Promise<never>((_, no) => { timer = setTimeout(() => { late = true; try { conn?.close(); } catch { /* already closed */ } no(new Error("timeout")); }, timeoutMs); });
  try {
    const c = conn = await Promise.race([opening, giveUp]);
    const dec = new TextDecoder(), chunk = new Uint8Array(4096);
    const wire: Wire = {
      read: async () => { const n = await c.read(chunk); return n == null ? null : dec.decode(chunk.subarray(0, n), { stream: true }); },
      write: async (s) => { const b = enc.encode(s); let o = 0; while (o < b.length) o += await c.write(b.subarray(o)); },
    };
    const id = [...crypto.getRandomValues(new Uint8Array(12))].map((x) => x.toString(16).padStart(2, "0")).join("");
    return await Promise.race([smtpTalk(wire, { user: cfg.user, pass: appPassword(cfg.pass) }, m.from.email, m.to, buildMessage(m, new Date(), id)), giveUp]);
  } catch (e) {
    if (late) throw new Error(`the mail server (${cfg.host}:${cfg.port}) did not answer within ${Math.round(timeoutMs / 1000)} s`);
    throw e;
  } finally { clearTimeout(timer); try { conn?.close(); } catch { /* already closed */ } }
}
