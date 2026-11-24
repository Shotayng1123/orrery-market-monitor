// What README.md and supabase/README.md say, held to the repository (section [AK]). Run:  cd jobs && npx tsx ../sim/readme.test.ts
// Until 23 Nov 2026 these checks were a section of sim/logic.test.ts, which stops a deploy of the server (deploy-server's
// "Logic checks") and of the site (deploy-web's test) when it fails; no workflow ran that file when README.md alone
// changed, so a README-only change could merge with no check run and then stop the next deploy of both (the check of
// fix part 3 of the final review of pull request #50). So they are a file of their own, which only logic-tests runs, on
// a change to either README, to a browser suite (web/e2e) or to the code they name. Since the check of fix part 4 the
// three sentences of the two READMEs that the logic file still held to the code are held here too (the "personal use"
// paragraph, the two switches, the statement as supabase/README.md quotes it): sim/logic.test.ts reads neither README,
// and no sentence of either can stop a deploy. It reads files with Node's own fs and imports two files that import
// nothing (jobs/probes/lib.ts, web/src/lib/labels.ts), so jobs/ alone installed is enough.
import { readFileSync as readText } from "node:fs";
import { termsBar as gateBar } from "../jobs/probes/lib.ts";
import { PERSONAL_USE_READ, PERSONAL_USE_TEXT } from "../web/src/lib/labels.ts";

let pass = 0, fail = 0;
const ck = (name: string, cond: boolean, detail?: unknown) => { if (cond) { pass++; console.log("  ✓ " + name); } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  ->  " + JSON.stringify(detail) : "")); } };

console.log("\n[AK] what the README says of the checks is what the repository holds (WD-2, DP-3 and PL-3 of the final review of pull request #50)");
{
  // The README's sentences on the browser checks had fallen behind the suites: 43 suites where run.cjs listed 49, the
  // paper portfolio's "three suites" where there were seven, three suites named nowhere, a suite credited with checking
  // the "personal use" lines that does not, and the morning check's windows of before the one-screen floor moved.
  const readme = readText(new URL("../README.md", import.meta.url), "utf8"), e2e = (f: string) => readText(new URL(`../web/e2e/${f}`, import.meta.url), "utf8");
  const suites = [...e2e("run.cjs").matchAll(/\{ name: "([^"]+)", needs:/g)].map((m) => m[1]);
  const count = /\(`web\/e2e`, [\d,@]+ checks in (\d+) suites on/.exec(readme)?.[1], timed = /for the (\d+) suites and/.exec(readme)?.[1];
  const paperSaid = /The \*\*paper portfolio\*\*[^.]*? has (\w+) suites\s*\(([^)]*)\)/.exec(readme), words = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
  const paperNamed = paperSaid ? [...paperSaid[2].matchAll(/`([^`]+)`/g)].map((m) => m[1]).sort() : [], paperIs = suites.filter((n) => /portfolio|^pf-/.test(n)).sort();
  const unnamed = ["source-lines", "source-lines-fit", "stock-line", "pf-verdicts-forms", "pf-verdicts-settings", "header", "header-sizes", "header-wide"].filter((n) => !readme.includes(`\`${n}\``));
  const pu = /`([a-z-]+)`, `([a-z-]+)` and `([a-z-]+)` also check the "personal use" lines/.exec(readme), puSuites = pu ? [pu[1], pu[2], pu[3]] : [], puWrong = puSuites.filter((n) => !suites.includes(n) || !/puse|personal use/i.test(e2e(`${n}.cjs`)));
  ck(`the README counts the ${suites.length} suites of web/e2e/run.cjs (it says ${count} and ${timed}), names the paper portfolio's ${paperIs.length} (it says "${paperSaid?.[1]}": ${paperNamed.join(", ")}) and the suites it describes by name (${unnamed.length} missing), and credits with the "personal use" lines only suites that check them (${puSuites.join(", ")}; ${puWrong.length} that do not)`,
    Number(count) === suites.length && Number(timed) === suites.length && words.indexOf(paperSaid?.[1] ?? "") === paperIs.length && JSON.stringify(paperNamed) === JSON.stringify(paperIs) && unnamed.length === 0 && puSuites.length === 3 && puWrong.length === 0, { suites: suites.length, count, timed, paperNamed, paperIs, unnamed, puWrong });
  const morning = e2e("morning.cjs"), vp = (code: string) => (new RegExp(`${code}: \\{ vp: \\[(\\d+), (\\d+)\\]`).exec(morning) ?? []).slice(1, 3).join("×");
  const sentence = /\(the one-screen layout at its smallest window at AUTO, ([\d×]+),[^;]*text L and XL[^,]*, ([\d×]+) and ([\d×]+);/.exec(readme);
  ck(`the README names the windows the morning check runs the one-screen layout at (${sentence ? sentence.slice(1).join(", ") : "no such sentence"}; morning.cjs: ${["C4c", "C4L", "C4X"].map(vp).join(", ")})`, !!sentence && sentence[1] === vp("C4c") && sentence[2] === vp("C4L") && sentence[3] === vp("C4X"), { sentence: sentence?.[0], c4: ["C4c", "C4L", "C4X"].map(vp) });
  const jpx = readText(new URL("../jobs/probes/pf_jpx.ts", import.meta.url), "utf8");
  ck("the README says pf_jpx asks a page a JPX page links by name and prints nothing of it but its address, status and title when its own title names a list, figures or a report (it cannot know the title before asking: PL-3), and every page pf_jpx takes by a link's name is put to that test (the short-selling rule, the closing auction, the document on tick classes)",
    /a JPX page links by name, never one from memory; of a page taken by its link's name whose own title or first heading\s+names a list, figures or a report it prints the address, the status and the title and nothing else/.test(readme) && !/and whose own title or first heading does not name a list/.test(readme) && (jpx.match(/notRulePage\((?:p|c|d)\.html\)/g) ?? []).length === 3);
}
{
  // PL-1 and PL-2 of the same review and its check (23 Nov 2026): the README said the closed list "holds no verb, so that
  // no sentence of a page is printed however short", and that every unlimited ban holds a site's files
  const readme = readText(new URL("../README.md", import.meta.url), "utf8"), jpxRead = readText(new URL("../jobs/probes/jpx_read.ts", import.meta.url), "utf8");
  const listDef = /const LABEL_WORDS = new Set\(\(([\s\S]*?)\)\.split/.exec(jpxRead)?.[1] ?? "", inList = new Set(listDef.replace(/["+\n]/g, " ").split(/\s+/).filter(Boolean));
  const named = /some words of the list are verbs as well as nouns \(([^)]*)\)/.exec(readme.replace(/\s+/g, " "))?.[1].split(/,\s*/) ?? [];
  ck(`PL-1: the README no longer says the closed list holds no verb, and the words it names as verbs as well as nouns are the list's own (${named.join(", ")}; ${named.filter((w) => !inList.has(w)).length} not in jpx_read.ts LABEL_WORDS)`, !/holds no verb/.test(readme) && named.length >= 5 && named.every((w) => inList.has(w)), { named, missing: named.filter((w) => !inList.has(w)) });
  ck("PL-2: the README says which unlimited bans the gate still reads as none (a purpose named for one of the acts a single ban lists is read as the whole ban's)", /a purpose named for one of the acts a single ban lists is read as the whole ban's/.test(readme.replace(/\s+/g, " ")));
  // the check of fix part 4 (23 Nov 2026): the README's account of the gate was not exact both ways. Every whole
  // sentence it quotes as an example is put to the gate itself (jobs/probes/lib.ts, which imports nothing): those it
  // says are still read as none, or hold nothing, read none; those it says hold the files read as bars
  const flat = readme.replace(/\s+/g, " "), from = flat.indexOf("A sentence of two bans is read ban by ban"), gate = from >= 0 ? flat.slice(from, flat.indexOf("a page reached by a \"legal\" link", from)) : "";
  const quoted = (t: string): string[] => [...t.matchAll(/"([A-Z][^"]*?\.)"/g)].map((m) => m[1]);
  // a Japanese example is a sentence from 商用目的 to its 。: none where the README says it is still read as none or that
  // it holds nothing (since the check of fix part 5, 23 Nov 2026), else a bar
  const noneSpan = gate.slice(gate.indexOf("Still read as none"), gate.indexOf("The gate errs the other way"));
  const ja = [...gate.matchAll(/(商用目的[^）)\s]*?。)( holds nothing\b)?/g)], jaNone = new Set([...[...noneSpan.matchAll(/(商用目的[^）)\s]*?。)/g)].map((m) => m[1]), ...ja.filter((m) => m[2]).map((m) => m[1])]);
  const none = [...quoted(noneSpan), ...[...gate.matchAll(/"([A-Z][^"]*?\.)" (?:holds nothing|does not)\b/g)].map((m) => m[1]), ...jaNone];
  const bars = [...quoted(gate.slice(gate.indexOf("The gate errs the other way"))), ...[...gate.matchAll(/"([A-Z][^"]*?\.)" holds the files/g)].map((m) => m[1]), ...ja.map((m) => m[1]).filter((l) => !jaNone.has(l))];
  const misread = [...none.filter((l) => gateBar(l) !== null).map((l) => `none: ${l}`), ...bars.filter((l) => gateBar(l) === null).map((l) => `bar: ${l}`)];
  ck(`the README's examples of what the terms gate reads are what it reads: ${none.length} it quotes as none or holding nothing, ${bars.length} as holding the files (${misread.length} read otherwise)`, none.length >= 6 && bars.length >= 4 && misread.length === 0, { misread, none, bars });
}
{
  // V7-1 of the check of batch 7b (23 Nov 2026): the README said that "after an act, 「し、」 and 「、また」 join the acts of
  // one ban", but the gate parts 「、また」 after an act's 〜し, and 「し、」 after an act its closed list lacks, so that
  // such a single ban limited to commercial use is read as two and holds the files. The README's account of the joins
  // is held to that list (CLAUSE in jobs/probes/lib.ts, read as text) and to what the gate reads of the verifier's
  // sentences (five single limited bans it parts, two it joins) and of the acts and words the README names
  const flat = readText(new URL("../README.md", import.meta.url), "utf8").replace(/\s+/g, " ");
  const clause = /^const CLAUSE = (\/.+\/i);$/m.exec(readText(new URL("../jobs/probes/lib.ts", import.meta.url), "utf8"))?.[1] ?? "";
  const listIn = (re: RegExp): string[] => re.exec(clause)?.[1].split("|") ?? [];
  const acts = listIn(/\(\?<=し\)\(\?<!\(\?:([^()]+)\)し\)、/), nouns = listIn(/\(\?<!\(\?:([^()]+)\)\)、\(\?=また\(\?!は\)/);
  const joins = /「し、」 joins the acts of one ban only after one of the (\d+) acts the gate lists \(([^)]*)\), 「、また」 only right after one of them \(([^)]*)\), and 「、または」 is "or" where no 「し、」 parts the sentence/.exec(flat);
  const parts = /elsewhere they part it as they part two bans, 「、また」 after an act's 〜し and 「し、」 after an act the list lacks \(([^)]*)\) among them, so that a single ban whose limit to commercial use is named before that mark is read as two, its second act without the limit, and holds the files \(([^)]*)\)/.exec(flat);
  const named = (joins?.[2] ?? "").split(/[,\s]+/).map((a) => a.replace(/し、$/, "")).filter((a) => a && a !== "…");
  const lacks = (parts?.[1] ?? "").split(/[,\s]+/).map((a) => a.replace(/し、$/, "")).filter((a) => a && a !== "…");
  const also = [...(parts?.[2] ?? "").matchAll(/「、([^」]+)」/g)].map((m) => m[1]).filter((w) => w !== "また");
  const S = (act: string, join: string): string => `商用目的で、本データを${act}${join}再配布することを禁止します。`;
  const parted = [...new Set([S("複製し", "、また"), S("複製し", "、また、"), S("転用し", "、または"), S("改編し", "、または"), S("取得し", "、または"), ...lacks.map((a) => S(`${a}し`, "、または")), ...also.map((w) => S("複製し", `、${w}`))])];
  const joined = [...new Set([S("複製し", "、または"), S("複製", "、また"), ...named.map((a) => S(`${a}し`, "、")), `商用目的での${joins?.[3] ?? "–"}を禁止します。`, ...also.map((w) => `商用目的での複製、${w}転載を禁止します。`)])];
  // parted too, but with the limit named after the mark, in the clause of the ban verb: such a line holds nothing
  const limitAfter = ["本データを転用し、商用目的で再配布することを禁止します。", "本データを複製し、また商用目的で再配布することを禁止します。"];
  const wrong = [...parted.filter((s) => gateBar(s) === null).map((s) => `none: ${s}`), ...[...joined, ...limitAfter].filter((s) => gateBar(s) !== null).map((s) => `bar: ${s}`)];
  ck(`V7-1: the README's account of the Japanese joins is the gate's: 「し、」 joins the acts of one ban only after one of the ${joins?.[1] ?? "–"} acts it lists (CLAUSE lists ${acts.length}; ${named.filter((a) => !acts.includes(a)).length} of the ${named.length} the README names are not among them), 「、また」 only right after one of them, and elsewhere both part a single ban, which then holds the files where its limit is named before the mark (after 複製し, and after the ${lacks.length} acts it names as lacking: ${lacks.filter((a) => acts.includes(a)).length} of them listed; 「、${also.join("」, 「、")}」 as 「、また」); ${parted.length} sentences it says are parted, ${joined.length} it says are joined and ${limitAfter.length} parted after their limit, put to the gate (${wrong.length} read otherwise)`,
    !!joins && !!parts && acts.length > 0 && JSON.stringify(acts) === JSON.stringify(nouns) && Number(joins[1]) === acts.length && named.length >= 2 && named.every((a) => acts.includes(a)) && lacks.length >= 2 && lacks.every((a) => !acts.includes(a)) && also.length === 3 && wrong.length === 0 && !/after an act, 「し、」 and 「、また」 join the acts of one ban/.test(flat),
    { joins: joins?.slice(1), parts: parts?.slice(1), acts: acts.length, nouns: nouns.length, named, lacks, also, wrong });
}

{
  // The few sentences of the two READMEs that sim/logic.test.ts held to the code until the check of fix part 4 (23 Nov
  // 2026): that file stops both deploys, so a word of a README could stop one. Here they are held all the same, on a
  // change to either README or to the code they name, before it merges (logic-tests); the logic file reads neither
  // README now.
  const readme = readText(new URL("../README.md", import.meta.url), "utf8"), sreadme = readText(new URL("../supabase/README.md", import.meta.url), "utf8");
  const sources = readme.slice(readme.indexOf("## Data sources"), readme.indexOf("\n## ", readme.indexOf("## Data sources") + 5)).replace(/\s+/g, " ");
  ck(`"personal use" (the owner's decision P4): the paragraph is in README.md's "Data sources" word for word ("${PERSONAL_USE_TEXT.slice(0, 60)}…"), with what is read today beside it (web/src/lib/labels.ts)`, sources.includes(PERSONAL_USE_TEXT) && sources.includes(PERSONAL_USE_READ), { text: sources.includes(PERSONAL_USE_TEXT), read: sources.includes(PERSONAL_USE_READ) });
  ck("README.md and supabase/README.md name the paper portfolio's two switches", /The paper portfolio's two switches/.test(readme) && /PAPER_ON_LIVE_SITE/.test(readme) && /PAPER_ON_SERVER/.test(readme) && /PAPER_ON_SERVER/.test(sreadme) && /PAPER_ON_LIVE_SITE/.test(sreadme));
  // the preview (slice 9, 23 Nov 2026): both READMEs say how the owner is added and removed, by the one repository
  // secret, and README.md names the page's three states where paper.ts does
  const paperTs = readText(new URL("../web/src/lib/paper.ts", import.meta.url), "utf8"), states = /export type PaperState = ("[a-z]+"(?: \| "[a-z]+")*);/.exec(paperTs)?.[1] ?? "";
  const howTo = (t: string) => /Settings › Secrets and variables › Actions ›\s+New\s+repository\s+secret\**,\s+name\s+`PF_PREVIEW_EMAILS`,\s+value\s+the\s+(?:account's\s+)?sign-in\s+email/.test(t) && /deploy-server[^.]*?\s+(?:run by hand )?(?:in mode `deploy`|with mode `deploy`)/.test(t) && /delete (?:the repository secret `PF_PREVIEW_EMAILS`|that secret)/.test(t);
  ck(`README.md and supabase/README.md say how the paper book's preview is given to an account and taken back (the repository secret PF_PREVIEW_EMAILS, then a server deploy), and README.md names the page's states as paper.ts does (${states})`, howTo(readme) && howTo(sreadme) && states === '"off" | "preview" | "on"' && /\*\*off\*\*[\s\S]{0,400}\*\*preview\*\*[\s\S]{0,600}\*\*on\*\*/.test(readme), { states, readme: howTo(readme), sreadme: howTo(sreadme) });
  const sql = readText(new URL("../supabase/migrations/20261121000001_pf_store.sql", import.meta.url), "utf8");
  const seeded = /insert into consent_statements[^;]*?values\s*\(\s*1\s*,\s*'((?:[^']|'')*)'\s*,\s*'((?:[^']|'')*)'/i.exec(sql), quoted = /^> "(Private notes, levels[^\n]*)"$/m.exec(sreadme)?.[1] ?? null;
  ck("supabase/README.md quotes the owner's record of the statement character for character as the migration seeds it, with \"☐ I agree\" after it (the engine's words against the seed: sim/logic.test.ts)", !!seeded && quoted === `${seeded[1].replace(/''/g, "'")} ☐ ${seeded[2]}`, { quoted, seeded: seeded?.slice(1) });
}

{
  // The check of slice 8 (23 Nov 2026), V8-2: GitHub's four browser jobs passed in both letter placements, but whether a
  // leg draws what the engineer's machine draws showed nowhere, since a job keeps web/e2e/.out only when it fails. Since
  // slice 10 each job prints the widths its suites measured (web/e2e/widths.cjs), and the README says how to print the
  // same block here. V8-1 and V8-3: two sentences said more than was measured (the browser started without the
  // launcher, and "every line" on whole px, where a line in a font of the machine itself is not).
  const readme = readText(new URL("../README.md", import.meta.url), "utf8"), flat = readme.replace(/\s+/g, " ");
  const widths = (() => { try { return readText(new URL("../web/e2e/widths.cjs", import.meta.url), "utf8"); } catch { return ""; } })(), wf = readText(new URL("../.github/workflows/deploy-web.yml", import.meta.url), "utf8");
  const watched = [...(/const WATCHED = \[([^\]]*)\]/.exec(widths)?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]), max = /\bMAX = (\d+)/.exec(widths)?.[1] ?? "";
  const said = /\*\*The widths each job prints\.\*\*([^*]*)/.exec(flat)?.[1] ?? "", named = [...new Set([...said.matchAll(/`([a-z-]+)`/g)].map((m) => m[1]).filter((n) => watched.includes(n)))];
  const runs = (wf.match(/^ {8}run: node e2e\/widths\.cjs$/gm) ?? []).length;
  ck(`V8-2: the README says each of the four browser jobs prints, passed or failed, the widths of ${named.join(", ") || "no suite"} (web/e2e/widths.cjs watches ${watched.join(", ")}), at most ${max || "?"} lines a job, and how to print the same block from a local run (cd web && node e2e/widths.cjs); deploy-web.yml runs it ${runs} times`,
    watched.length === 3 && JSON.stringify(named) === JSON.stringify(watched) && max !== "" && said.includes(`at most ${max} lines`) && said.includes("`cd web && node e2e/widths.cjs`") && /passed or failed/.test(said) && runs === 4, { watched, named, max, runs, said: said.slice(0, 200) });
  ck("V8-1 and V8-3: the README says that the engineer's machine, its launcher left out, draws the page's faces on whole px as GitHub's runner does, a line in a font of the machine itself keeping its widths either way, and that with --font-render-hinting=full every line in the page's own faces (not every line) is on whole px",
    !/every line is then on whole px/.test(flat) && /every line in the page's own faces is then on whole px/.test(flat) && /without the launcher[^.]*? draws them on whole px/.test(flat), { full: /every line is then on whole px/.test(flat) });
}

{
  // T-2 of the check of IDX-0e (24 Nov 2026): the README's entry for ix_terms names the addresses the probe asks, in its
  // order, its budget of requests and the Crawl-delay over which it holds a host's pages, and no check held them to the
  // file. The file is read as text, as V7-1 reads CLAUSE (run as the program, its last line awaits the run, so it is not
  // imported here): FIXED's addresses as its F("…") entries write them, BUDGET and CRAWL_MAX_S
  const flat = readText(new URL("../README.md", import.meta.url), "utf8").replace(/\s+/g, " "), src = readText(new URL("../jobs/probes/ix_terms.ts", import.meta.url), "utf8");
  const list = /^export const FIXED: readonly Fixed\[\] = \[$([\s\S]*?)^\];$/m.exec(src)?.[1] ?? "";
  const fixed = [...list.matchAll(/\bF\("([^"]+)", "[a-z]+"\)/g)].map((m) => m[1]), entries = (list.match(/\bF\(/g) ?? []).length;
  const budget = /^export const BUDGET = (\d+);$/m.exec(src)?.[1] ?? "", crawl = /\bCRAWL_MAX_S = (\d+)[,;]/.exec(src)?.[1] ?? "";
  const from = flat.indexOf("- `ix_terms` (IDX-0e"), next = flat.indexOf("- `ix_sox` (IDX-0e2", from), to = next > from ? next : flat.indexOf("Since 21 Nov 2026 (the paper portfolio's second run of probes", from), entry = from >= 0 && to > from ? flat.slice(from, to) : "";
  const order = /It asks these (\d+) addresses, all https, in this order: (.*?)\. Each host's `robots\.txt` comes first/.exec(entry), said: string[] = [];
  let host = "";
  for (const [, t] of (order?.[2] ?? "").matchAll(/`([^`]+)`/g)) { if (t.startsWith("/")) said.push(`https://${host}${t}`); else host = t; }
  const most = /\bAt most (\d+) requests: an address that answered 429\b/.exec(entry)?.[1] ?? "", outOf = /\bthen the requests made out of (\d+)\./.exec(entry)?.[1] ?? "", over = /\ba Crawl-delay over (\d+) s holds the host's pages\b/.exec(entry)?.[1] ?? "";
  const misplaced = fixed.filter((u, i) => said[i] !== u).length;
  ck(`T-2 of the check of IDX-0e: the README's entry for ix_terms names the ${fixed.length} addresses of FIXED in jobs/probes/ix_terms.ts in its order ("these ${order?.[1] ?? "–"} addresses", ${said.length} named, ${misplaced} not in their place), its budget, BUDGET = ${budget || "–"} ("At most ${most || "–"} requests", "out of ${outOf || "–"}"), and CRAWL_MAX_S = ${crawl || "–"} ("a Crawl-delay over ${over || "–"} s holds the host's pages")`,
    fixed.length > 0 && fixed.length === entries && fixed.every((u) => u.startsWith("https://")) && JSON.stringify(said) === JSON.stringify(fixed) && Number(order?.[1]) === fixed.length
      && budget !== "" && most === budget && outOf === budget && crawl !== "" && over === crawl, { fixed, said, budget, most, outOf, crawl, over });

  // B-1 and T-1 of the check of IDX-0e2 (24 Nov 2026): the entry said "(13 addresses in a budget of 14: a run asks one
  // address again at most)", which is false where a page is not asked, since each such page leaves the budget a place
  // more (a robots.txt that redirected to itself was followed 5 times after four pages held). The sentence that
  // replaces it is held to the file's constants: FIXED's count and BUDGET (one place to spare), REDIRECTS_MAX, and the
  // pages that must go unasked before that many redirects are followed (sim/logic.test.ts [AR] runs those worlds)
  const max = /^export const REDIRECTS_MAX = (\d+);$/m.exec(src)?.[1] ?? "", spare = Number(budget) - fixed.length;
  const hops = /\ba 3xx is followed only to that same address \([^)]*\), at most (\d+) times, each only where the budget keeps a place for every address still to come\b/.exec(entry)?.[1] ?? "";
  const room = /\((\d+) addresses in a budget of (\d+): one place to spare, and one more for each page not asked before the address asked again; so a `robots\.txt` that redirects to itself every time is followed (\d+) times only where (\d+) pages or more before it were not asked, and at most once where every page before it was asked\)/.exec(entry);
  ck(`B-1 of the check of IDX-0e2: the README's entry for ix_terms says how far the budget lets a run ask again, as the file's constants give it ("${room ? `${room[1]} addresses in a budget of ${room[2]}: one place to spare … followed ${room[3]} times only where ${room[4]} pages or more before it were not asked` : "–"}"; FIXED ${fixed.length}, BUDGET ${budget || "–"}, REDIRECTS_MAX ${max || "–"}, "at most ${hops || "–"} times"), and no longer that a run asks one address again at most`,
    !!room && spare === 1 && Number(room[1]) === fixed.length && room[2] === budget && max !== "" && room[3] === max && Number(room[4]) === Number(max) - spare && hops === max && !/a run asks one address again at most/.test(entry), { room: room?.slice(1), fixed: fixed.length, budget, max, hops });
}

{
  // IDX-0e2 (24 Nov 2026): the README's entry for ix_sox, held to jobs/probes/ix_sox.ts as T-2 holds ix_terms' (the file
  // read as text): the addresses it asks, in its order, its budget of requests, the form of a ticker it prints, and the
  // owner's release its log's first lines state
  const flat = readText(new URL("../README.md", import.meta.url), "utf8").replace(/\s+/g, " "), src = (() => { try { return readText(new URL("../jobs/probes/ix_sox.ts", import.meta.url), "utf8"); } catch { return ""; } })();
  const list = /^export const FIXED: readonly Fixed\[\] = \[$([\s\S]*?)^\];$/m.exec(src)?.[1] ?? "";
  const fixed = [...list.matchAll(/\bF\("([^"]+)", "[a-z]+"\)/g)].map((m) => m[1]), entries = (list.match(/\bF\(/g) ?? []).length;
  const budget = /^export const BUDGET = (\d+);$/m.exec(src)?.[1] ?? "", ticker = /^export const TICKER = \/(.+)\/;$/m.exec(src)?.[1] ?? "";
  const from = flat.indexOf("- `ix_sox` (IDX-0e2"), to = flat.indexOf("Since 21 Nov 2026 (the paper portfolio's second run of probes", from), entry = from >= 0 && to > from ? flat.slice(from, to) : "";
  const order = /It asks these (\d+) addresses, all https, in this order: (.*?)\. Its `robots\.txt` comes first/.exec(entry), said: string[] = [];
  let host = "";
  for (const [, t] of (order?.[2] ?? "").matchAll(/`([^`]+)`/g)) { if (t.startsWith("/")) said.push(`https://${host}${t}`); else host = t; }
  const most = /\bAt most (\d+) requests: an address that answered 429\b/.exec(entry)?.[1] ?? "", outOf = /\bthen the requests made out of (\d+)\./.exec(entry)?.[1] ?? "";
  ck(`IDX-0e2: the README's entry for ix_sox names the ${fixed.length} addresses of FIXED in jobs/probes/ix_sox.ts in its order ("these ${order?.[1] ?? "–"} addresses", ${said.length} named), its budget, BUDGET = ${budget || "–"} ("At most ${most || "–"} requests", "out of ${outOf || "–"}"), the form of a ticker it prints (TICKER = /${ticker || "–"}/) and the owner's release of 24 Nov 2026`,
    fixed.length > 0 && fixed.length === entries && fixed.every((u) => u.startsWith("https://")) && JSON.stringify(said) === JSON.stringify(fixed) && Number(order?.[1]) === fixed.length
      && budget !== "" && most === budget && outOf === budget && ticker !== "" && entry.includes(`\`${ticker}\``) && /released by the owner on 24 Nov 2026/.test(entry) && /personal use/.test(entry), { fixed, said, budget, most, outOf, ticker });
}

console.log("\n" + (fail ? `✗ ${fail} failed, ${pass} passed` : `✓ all ${pass} passed`) + "\n");
process.exit(fail ? 1 : 0);
