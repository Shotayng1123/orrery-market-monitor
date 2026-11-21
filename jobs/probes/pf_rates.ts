// The paper portfolio's probe of rates and fixings, the second run (P-0b: C/portfolio-plan.md §3.1b item 6): only what
// the run of 20 Nov 2026 did not read (C/probes/pf_rates.log). Read then and not asked again: SONIA, the ECB's
// reference rates, TGCR and BGCR, the reverse repo's rates, PTAX, the Treasury's 2013 curve, MOF's JGB file. Dropped by
// the owner's answer of 21 Nov 2026: JPX's settlement file and its page of the day's volumes (Osaka's contracts are
// out). Official sources, no key, no login; read-only, nothing written.
// It prints:
//   1. FedInvest's end-of-day prices of Treasury securities (TreasuryDirect, the Bureau of the Fiscal Service), for
//      P-13 and P-15. On 20 Nov the probe filled the first form of the page, which is the site's search (l.79–82). Now:
//      every form of the page with its fields, the one that asks for a price date (fields named month, day and
//      year), and one day's prices from it: the last weekday before today (a US holiday is not known here: a page
//      that says no prices exist for the date is the finding);
//   2. an INR reference rate for P-8b's rupee NDFs, status and format only: the Reserve Bank of India's reference-rate
//      archive (the page of 20 Nov, l.70–75, is a search form): the form's fields, and what it answers for the last
//      ten days. FBIL's own page is built by scripts (l.67–69: one line of text) and names no data address: not asked.
// Each site's robots.txt is read first; the terms of these two official sites are not read here (the probes that read
// a site's terms are pf_bench and pf_borrow, for publishers' files).
// Requests: at most 6, 1.5 s apart: treasurydirect.gov (robots.txt, the page, the form), rbi.org.in (the same three);
// a robots.txt that answers 429 is asked once more after the wait it names (60 s at most), so 8 at the very most.
// Runtime: node.
//   Actions > source-probe > Run workflow: probe = pf_rates, runtime = node
import { decoded, head, masked, page, pause, printLines, requestsMade, robots, textLines, titleOf } from "./lib.ts";

const GAP = 1500, MAX = 6;
const t0 = Date.now(), now = new Date(t0);
/** The last weekday before today. */
const lastBusiness = (() => { const d = new Date(t0 - 86400e3); while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1); return d; })();
console.log(`run at ${now.toISOString().slice(0, 16).replace("T", " ")} UTC`);

interface Field { tag: string; name: string; type: string; value: string }
interface Form { action: string; method: string; fields: Field[] }
/** Every form of a page: its action, its method and its named fields (a select's first option as its value). */
function formsOf(html: string): Form[] {
  const attr = (s: string, k: string) => decoded(s.match(new RegExp(`\\b${k}\\s*=\\s*"([^"]*)"`, "i"))?.[1] ?? s.match(new RegExp(`\\b${k}\\s*=\\s*'([^']*)'`, "i"))?.[1] ?? s.match(new RegExp(`\\b${k}\\s*=\\s*([^\\s"'>]+)`, "i"))?.[1] ?? "");
  return [...html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)].map((m) => ({
    action: attr(m[1], "action"), method: (attr(m[1], "method") || "get").toLowerCase(),
    fields: [...m[2].matchAll(/<(input|select|textarea|button)\b([^>]*)>/gi)].map((x) => ({ tag: x[1].toLowerCase(), name: attr(x[2], "name"), type: attr(x[2], "type").toLowerCase(), value: attr(x[2], "value") })).filter((x) => x.name),
  }));
}
/** A form's fields for the log: names and types; a hidden field's value is never printed (it can be long, or a token). */
const fieldList = (f: Form) => f.fields.map((x) => `${x.name} (${x.type || x.tag}${x.type !== "hidden" && x.value ? ` "${x.value.slice(0, 30)}"` : ""})`).join(", ") || "no named field";

head("1. FedInvest (TreasuryDirect): end-of-day prices of Treasury securities, from the page's own price-date form");
{
  const origin = "https://www.treasurydirect.gov", path = "/GA-FI/FedInvest/selectSecurityPriceDate";
  const rb = await robots(origin, [path]);
  await pause(GAP);
  if (!rb.allows(path)) console.log("  not asked: robots.txt holds the page's path");
  else {
    const sel = await page(origin + path);
    await pause(GAP);
    if (sel.ok) {
      const forms = formsOf(sel.html);
      console.log(`  title: ${titleOf(sel.html) || "–"}; ${forms.length} forms:`);
      forms.forEach((f, i) => console.log(`    form ${i + 1}: ${f.method.toUpperCase()} ${masked(f.action) || "(the page itself)"}; fields: ${fieldList(f)}`));
      const form = forms.find((f) => f.fields.some((x) => /month/i.test(x.name)) && f.fields.some((x) => /year/i.test(x.name)) && !f.fields.some((x) => x.name === "q"));
      if (!form) console.log("  no form asks for a price date (fields named month and year): nothing is submitted");
      else {
        const body = new URLSearchParams(), D = lastBusiness;
        for (const x of form.fields) {
          if (/month/i.test(x.name)) body.set(x.name, String(D.getUTCMonth() + 1));
          else if (/day/i.test(x.name)) body.set(x.name, String(D.getUTCDate()));
          else if (/year/i.test(x.name)) body.set(x.name, String(D.getUTCFullYear()));
          else if (x.type === "hidden") body.set(x.name, x.value);
        }
        const submit = form.fields.find((x) => x.type === "submit" && /csv/i.test(x.value)) ?? form.fields.find((x) => x.type === "submit");
        if (submit) body.set(submit.name, submit.value);
        const target = new URL(form.action || path, sel.final).toString();
        console.log(`  the price-date form: ${form.method.toUpperCase()} ${masked(target)}; asking for ${D.toISOString().slice(0, 10)} with ${[...body.keys()].join(", ")}${submit ? ` (the button "${submit.value}")` : ""}`);
        if (!rb.allows(target)) console.log("  not asked: robots.txt holds the form's address");
        else {
          const res = form.method === "post"
            ? await page(target, { method: "POST", body: body.toString(), headers: { "content-type": "application/x-www-form-urlencoded" }, timeoutMs: 60000 })
            : await page(`${target}${target.includes("?") ? "&" : "?"}${body.toString()}`, { timeoutMs: 60000 });
          await pause(GAP);
          if (res.ok) {
            const csv = /csv|text\/plain|octet-stream/i.test(res.type) || /^[0-9A-Z]{9},/m.test(res.html);
            if (csv) {
              const ls = res.html.split(/\r?\n/).filter((l) => l.trim()), types = new Map<string, number>();
              for (const l of ls) { const t = l.split(",")[1]?.trim(); if (t) types.set(t, (types.get(t) ?? 0) + 1); }
              console.log(`  CSV: ${ls.length} lines; ${ls[0]?.split(",").length ?? 0} columns; the first three: ${ls.slice(0, 3).join(" · ")}; the last: ${ls[ls.length - 1] ?? "–"}`);
              console.log(`  by the second column (the security's type): ${[...types].slice(0, 10).map(([k, n]) => `${k} ${n}`).join(", ")}`);
            } else {
              const ls = textLines(res.html);
              console.log(`  an HTML page: title ${titleOf(res.html) || "–"}; ${ls.length} lines; rows of a table (lines with cells): ${ls.filter((l) => /\|/.test(l)).length}`);
              printLines(ls, /CUSIP|SECURITY TYPE|MARKET BASED|no (data|prices)|not available|error|\b9128[0-9A-Z]{5}\b|\b9127[0-9A-Z]{5}\b/i, 8);
            }
          }
        }
      }
    }
  }
}

head("2. An INR reference rate: the Reserve Bank of India's reference-rate archive (status and format only)");
{
  const origin = "https://www.rbi.org.in", path = "/Scripts/ReferenceRateArchive.aspx";
  const rb = await robots(origin, [path]);
  await pause(GAP);
  if (!rb.allows(path)) console.log("  not asked: robots.txt holds the page's path");
  else {
    const p = await page(origin + path, { timeoutMs: 60000 });
    await pause(GAP);
    if (p.ok) {
      const forms = formsOf(p.html);
      console.log(`  title: ${titleOf(p.html) || "–"}; ${forms.length} forms:`);
      forms.forEach((f, i) => console.log(`    form ${i + 1}: ${f.method.toUpperCase()} ${masked(f.action) || "(the page itself)"}; fields: ${fieldList(f).slice(0, 700)}`));
      const form = forms.find((f) => f.fields.some((x) => /from/i.test(x.name) && x.type !== "hidden") && f.fields.some((x) => /to/i.test(x.name) && x.type !== "hidden"));
      if (!form) console.log("  no form asks for a from date and a to date: nothing is submitted");
      else {
        const dmy = (d: Date) => `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
        const body = new URLSearchParams(), from = new Date(t0 - 10 * 86400e3);
        let radio = false;
        for (const x of form.fields) {
          if (x.type === "hidden") body.set(x.name, x.value);
          else if (x.type === "text" || x.tag === "textarea" || x.type === "") { if (/from/i.test(x.name)) body.set(x.name, dmy(from)); else if (/to/i.test(x.name)) body.set(x.name, dmy(now)); }
          else if (x.type === "radio" && !body.has(x.name)) { body.set(x.name, x.value); radio = true; }
          else if (x.tag === "select" && !body.has(x.name)) body.set(x.name, x.value);
        }
        const submit = form.fields.find((x) => x.type === "submit" || x.type === "image");
        if (submit) { if (submit.type === "image") { body.set(`${submit.name}.x`, "5"); body.set(`${submit.name}.y`, "5"); } else body.set(submit.name, submit.value); }
        const target = new URL(form.action || path, p.final).toString();
        console.log(`  the archive's form: ${form.method.toUpperCase()} ${masked(target)}; asking for ${dmy(from)} to ${dmy(now)} (day/month/year, a candidate format) with ${[...body.keys()].filter((k) => !/^__/.test(k)).join(", ")} and ${[...body.keys()].filter((k) => /^__/.test(k)).length} hidden page-state fields${radio ? "; the first choice of each radio group" : ""}`);
        if (!rb.allows(target)) console.log("  not asked: robots.txt holds the form's address");
        else {
          const res = form.method === "post"
            ? await page(target, { method: "POST", body: body.toString(), headers: { "content-type": "application/x-www-form-urlencoded" }, timeoutMs: 60000 })
            : await page(`${target}${target.includes("?") ? "&" : "?"}${body.toString()}`, { timeoutMs: 60000 });
          await pause(GAP);
          if (res.ok) {
            const ls = textLines(res.html), rows = ls.filter((l) => /\|/.test(l) && /\b\d{1,2}[\/\-. ](\d{1,2}|[A-Za-z]{3,9})[\/\-. ,]+\d{2,4}\b/.test(l) && /\d+\.\d{2,4}/.test(l));
            console.log(`  the answer: title ${titleOf(res.html) || "–"}; ${ls.length} lines; rows with a date and a rate: ${rows.length}`);
            for (const l of ls.filter((x) => /\|/.test(x) && /date|USD|US Dollar|GBP|EUR|YEN|JPY/i.test(x) && !/\d+\.\d{2,4}/.test(x)).slice(0, 2)) console.log(`  the header row: ${l.slice(0, 200)}`);
            for (const l of rows.slice(0, 4)) console.log(`  | ${l.slice(0, 200)}`);
            if (rows.length > 4) console.log(`  | … and the last: ${rows[rows.length - 1].slice(0, 200)}`);
            if (!rows.length) printLines(ls, /no (record|data)|not available|invalid|error|select|reference rate/i, 6);
          }
        }
      }
    }
  }
}

console.log(`\nrequests made: ${requestsMade()} (at most ${MAX}); ${Math.round((Date.now() - t0) / 1000)} s`);
