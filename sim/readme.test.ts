// What README.md says of the repository's checks, held to the repository (section [AK]). Run:  cd jobs && npx tsx ../sim/readme.test.ts
// Until 23 Nov 2026 these checks were a section of sim/logic.test.ts, which stops a deploy of the server (deploy-server's
// "Logic checks") and of the site (deploy-web's test) when it fails. A sentence of README.md cannot break either, and no
// workflow ran that file when README.md alone changed: a README-only change could merge with no check run and then stop
// the next deploy of both (the check of fix part 3 of the final review of pull request #50). So they are a file of their
// own, which only logic-tests runs: on a change to README.md, to a browser suite (web/e2e) or to the source probes, as on
// the changes it ran on before. It reads files only, with Node's own fs, so jobs/ alone installed is enough.
import { readFileSync as readText } from "node:fs";

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
  const unnamed = ["source-lines", "pf-verdicts-forms", "pf-verdicts-settings", "header", "header-sizes", "header-wide"].filter((n) => !readme.includes(`\`${n}\``));
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
}

console.log("\n" + (fail ? `✗ ${fail} failed, ${pass} passed` : `✓ all ${pass} passed`) + "\n");
process.exit(fail ? 1 : 0);
