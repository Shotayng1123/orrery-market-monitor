// Makes the key pair the server signs push notifications with (VAPID, RFC 8292) and writes it to jobs/.env.vapid,
// which git ignores. Nothing is printed but the file's name: the private key must not be shown or committed.
// Run once:   node jobs/tools/gen_vapid.mjs   then   npx supabase secrets set --env-file jobs/.env.vapid
// The file is kept: a different key would silently end every device's subscription, so an existing file is left alone.
import fs from "node:fs";
import crypto from "node:crypto";
const p = new URL("../.env.vapid", import.meta.url);
if (fs.existsSync(p)) { console.log("jobs/.env.vapid exists already: left as it is (set the same keys again with: npx supabase secrets set --env-file jobs/.env.vapid)"); process.exit(0); }
const { privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const jwk = privateKey.export({ format: "jwk" });
const pub = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, "base64url"), Buffer.from(jwk.y, "base64url")]).toString("base64url");
fs.writeFileSync(p, `VAPID_PUBLIC_KEY=${pub}\nVAPID_PRIVATE_KEY=${jwk.d}\n`, { mode: 0o600 });
console.log("written: jobs/.env.vapid (two lines, not shown). Next: npx supabase secrets set --env-file jobs/.env.vapid");
