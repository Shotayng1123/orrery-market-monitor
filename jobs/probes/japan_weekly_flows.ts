// B-07: Japan's weekly flows. What a weekly job would read:
//   - Ministry of Finance, "International Transactions in Securities (based on reports from designated major
//     investors)": weekly, Thursdays 08:50 JST (mof.go.jp, a host the server already reads for the JGB curve).
//     The CSV addresses are candidates (marked so); the index page is searched for its data files as well.
//   - JPX, "Trading by Type of Investors": weekly, foreigners' net buying of shares (jpx.co.jp, already read for
//     short selling and margin balances). Its page is searched for the data files.
// Runtime: node (a job on GitHub, started by the database after each release).
//   Actions > source-probe > Run workflow: probe = japan_weekly_flows, runtime = node
import { head, look } from "./lib.ts";

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const links = (html: string, base: string): string[] => [...new Set([...html.matchAll(/href="([^"]+\.(?:csv|xlsx?|pdf|zip))"/gi)].map((m) => new URL(m[1], base).toString()))];

head("MOF: International Transactions in Securities, the English index page (links to data files)");
const mofIndex = "https://www.mof.go.jp/english/policy/international_policy/reference/itn_transactions_in_securities/index.html";
{
  const r = await look(mofIndex, { show: 0 });
  if (r.ok) { const ls = links(r.text, mofIndex); console.log(`  ${ls.length} data-file links; first 12:\n  ${ls.slice(0, 12).join("\n  ")}`); }
}
for (const [what, url] of [
  ["MOF: the weekly CSV, English (candidate address)", "https://www.mof.go.jp/english/policy/international_policy/reference/itn_transactions_in_securities/week.csv"],
  ["MOF: the weekly CSV, Japanese (candidate address)", "https://www.mof.go.jp/policy/international_policy/reference/itn_transactions_in_securities/week.csv"],
]) {
  await pause(500);
  head(what);
  const r = await look(url, { show: 400 });
  if (r.ok) {
    const lines = r.text.split(/\r?\n/).filter((l) => l.trim());
    console.log(`  ${lines.length} lines; last 3:\n  ${lines.slice(-3).join("\n  ")}`);
  }
}

await pause(500);
head("JPX: Trading by Type of Investors, the English page (links to data files)");
const jpxIndex = "https://www.jpx.co.jp/english/markets/statistics-equities/investor-type/index.html";
{
  const r = await look(jpxIndex, { show: 0 });
  if (r.ok) {
    const ls = links(r.text, jpxIndex);
    console.log(`  ${ls.length} data-file links; first 12:\n  ${ls.slice(0, 12).join("\n  ")}`);
    const first = ls.find((l) => /\.xlsx?$/i.test(l)) ?? ls[0];
    if (first) { await pause(500); head("JPX: the first data file listed (status, type and size only)"); await look(first, { show: 0, timeoutMs: 60000 }); }
  }
}
