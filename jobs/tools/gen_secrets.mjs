// Adds MONITOR_TOKEN_SECRET, CRON_SECRET and REPORT_SECRET to jobs/.env when missing (random, never printed).
import fs from "node:fs";
import crypto from "node:crypto";
const p = new URL("../.env", import.meta.url);
let env = fs.readFileSync(p, "utf8");
const added = [];
for (const k of ["MONITOR_TOKEN_SECRET", "CRON_SECRET", "REPORT_SECRET"]) {
  if (new RegExp("^" + k + "=", "m").test(env)) continue;
  env += (env.endsWith("\n") || env === "" ? "" : "\n") + k + "=" + crypto.randomBytes(24).toString("base64url") + "\n";
  added.push(k);
}
fs.writeFileSync(p, env);
console.log("generated:", added.join(", ") || "none (already present)");
