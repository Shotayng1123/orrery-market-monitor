// Facts for the owner's decision on an EDINET API key: what the API's own specification (金融庁, EDINET API 仕様書,
// Version 2) says about registering for a key (email, phone, multi-factor), the key's place in a request, the limits
// and answers such as 429, and the edition and date of the document. Round 1 knew of this PDF only from search
// summaries. This fetches the PDF once, reads its text with unpdf (a PDF.js build for Deno and servers) and prints
// the passages around those words, with their pages. It writes nothing anywhere.
// Runtime: deno (the PDF reader is loaded from npm at run time; nothing is added to jobs/package.json).
//   Actions > source-probe > Run workflow: probe = edinet_spec_pdf, runtime = deno
import { head, masked, UA } from "./lib.ts";

const PDF = "https://disclosure2dl.edinet-fsa.go.jp/guide/static/disclosure/download/ESE140206.pdf";
const WORDS = ["Version", "改訂", "年", "APIキー", "多要素認証", "電話番号", "SMS", "音声", "メールアドレス", "パスワード", "ポップアップ",
  "Subscription-Key", "429", "大量", "間隔", "無料", "利用規約", "書類一覧API", "書類取得API", "type=", "CSV"];

head(`EDINET API specification (PDF): ${PDF}`);
const t0 = Date.now();
let buf: Uint8Array | null = null;
try {
  const r = await fetch(PDF, { headers: { "user-agent": UA, accept: "application/pdf,*/*" }, signal: AbortSignal.timeout(60000) });
  buf = new Uint8Array(await r.arrayBuffer());
  console.log(`${r.status} ${r.ok ? "OK" : "NOT OK"}  ${r.headers.get("content-type") ?? "no type"}  ${buf.length} bytes  ${Date.now() - t0} ms` +
    `${r.headers.get("last-modified") ? `  last-modified ${r.headers.get("last-modified")}` : ""}`);
  if (!r.ok) buf = null;
} catch (e) {
  console.log(`FAILED  ${Date.now() - t0} ms\n  ${masked(e instanceof Error ? `${e.name}: ${e.message}` : String(e))}`);
}

if (buf) {
  try {
    const { extractText, getDocumentProxy } = await import("npm:unpdf");
    const pdf = await getDocumentProxy(buf);
    const meta = await pdf.getMetadata().catch(() => null) as { info?: Record<string, unknown> } | null;
    const info = meta?.info ?? {};
    console.log(`  pages: ${pdf.numPages}; title: ${info.Title ?? "–"}; created: ${info.CreationDate ?? "–"}; modified: ${info.ModDate ?? "–"}; producer: ${info.Producer ?? "–"}`);
    const { text } = await extractText(pdf, { mergePages: false }) as { text: string[] };
    const pages = text.map((t) => t.replace(/\s+/g, " ").trim());
    const total = pages.reduce((s, t) => s + t.length, 0);
    console.log(`  text read: ${total} characters over ${pages.length} pages${total < 200 ? " (too little: the fonts may lack a Unicode map, so the text could not be read)" : ""}`);
    console.log(`  page 1: ${pages[0]?.slice(0, 500) ?? "–"}`);
    console.log(`  page 2: ${pages[1]?.slice(0, 500) ?? "–"}`);
    // A passage per hit: 160 characters each side, at most 6 per word; Japanese text is matched with its spaces taken out.
    for (const w of WORDS) {
      if (w === "年") continue; // the edition's date is in pages 1 and 2 above
      const hits: string[] = [];
      pages.forEach((t, i) => {
        const flat = t.replace(/(?<=[^\x00-\x7f]) (?=[^\x00-\x7f])/g, "");
        let at = flat.indexOf(w);
        while (at >= 0 && hits.length < 6) {
          hits.push(`p.${i + 1}: …${flat.slice(Math.max(0, at - 160), at + w.length + 160)}…`);
          at = flat.indexOf(w, at + w.length + 160);
        }
      });
      console.log(`\n  "${w}": ${hits.length ? `${hits.length} passage(s)${hits.length === 6 ? " (first 6)" : ""}` : "not found"}`);
      for (const h of hits) console.log(`    ${masked(h)}`);
    }
  } catch (e) {
    console.log(`  the PDF could not be read: ${masked(e instanceof Error ? `${e.name}: ${e.message}` : String(e))}`);
  }
}
