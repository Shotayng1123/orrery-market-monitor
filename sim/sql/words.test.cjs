// The rule an instrument's page matches headlines by, as the database applies it (the reviewer's R2B-03, 20 Nov 2026):
// supabase/functions/_shared/instrfeed.ts wordsPg writes the instrument's words as one pattern for PostgreSQL's ~*
// (what PostgREST's `imatch` runs), with word edges [[:<:]] and [[:>:]]. Here that pattern runs on PGlite against
// sample titles, beside the page's own rule (wordsRegex) on the same titles: whole words, any case, "S&P 500" and
// "Bank of Japan" as phrases, a word inside a longer word never. The words are the server's own (newsWords), read
// from the module itself; Node strips its types (22.18 and later; the script passes the flag for older 22s).
// From sim/sql:  npm test
const { PGlite } = require("@electric-sql/pglite");
const path = require("path");
let pass = 0, fail = 0;
const ck = (name, cond, detail) => { if (cond) { pass++; console.log("  ✓ " + name); } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  ->  " + JSON.stringify(detail) : "")); } };
(async () => {
  const feed = await import(path.join(__dirname, "..", "..", "supabase", "functions", "_shared", "instrfeed.ts"));
  const db = new PGlite();
  const pg = async (title, pattern) => (await db.query("select $1 ~* $2 as m", [title, pattern])).rows[0].m;
  // [symbol, name, titles that name it, titles that do not]
  const CASES = [
    ["USDJPY=X", "USD/JPY",
      ["Yen firms as traders weigh the Bank of Japan&#x2019;s next move", "BoJ holds rates", "USD/JPY rises to 158", "the yen's slide deepens", "YEN WEAKENS PAST 160", "bank of japan to meet", "Japan: yen, then bonds"],
      ["Hayen Corp shares rise", "Bojangles sales climb", "Bank of Japanese art reopens", "JPYC token listed", "Yemen talks resume", "Kyen and Co"]],
    ["^GSPC", "S&P 500",
      ["S&P 500 hits a record", "s&p 500 falls 2%", "Stocks: the S&P 500's best week", "Wall Street rallies", "WALL STREET closes higher"],
      ["S&P 5000 is fiction", "AS&P 500 fund", "Wall Streetwise newsletter", "The S&P index"]],
    ["GC=F", "Gold",
      ["Gold climbs to a record", "Central banks buy bullion", "GOLD and silver"],
      ["Goldman Sachs raises its target", "Marigold Inc.", "Goldilocks economy"]],
    ["JGB10Y", "JGB 10Y yield",
      ["JGBs slide as the BoJ meets", "JGB yields at a 17-year high", "Japanese government bonds sell off", "Investors shun Japanese government bond auction"],
      ["JGBX index", "Japanese governments change", "Bojangles chain grows"]],
    ["^STOXX50E", "Euro Stoxx 50",
      ["Euro Stoxx 50 rises", "European shares open higher", "Stoxx 50 futures slip"],
      ["Euro Stoxxx", "European sharesight"]],
  ];
  for (const [symbol, name, yes, no] of CASES) {
    const words = feed.newsWords(symbol, name), pattern = feed.wordsPg(words), re = feed.wordsRegex(words);
    const got = [];
    for (const t of [...yes, ...no]) got.push({ t, db: await pg(t, pattern), page: re.test(t.replace(/&#x2019;|&#8217;|’/g, "'")) });
    const want = (t) => yes.includes(t);
    const wrongDb = got.filter((g) => g.db !== want(g.t)), apart = got.filter((g) => g.db !== g.page);
    ck(`${name} (${words.join(", ")}): the database's pattern takes the ${yes.length} titles that name it as a whole word, in any case, and none of the ${no.length} where it is only part of a word`, wrongDb.length === 0, wrongDb);
    ck(`${name}: the page's own rule agrees with the database on every one of the ${got.length} titles`, apart.length === 0, apart);
  }
  // a pattern for words with signs in them stays a pattern of plain characters: "S&P 500" holds no special sign
  const sp = feed.wordsPg(["S&P 500", "Dow"]);
  ck(`a phrase with "&" and a space is matched as written ("${sp}")`, await pg("The S&P 500 and the Dow rose", sp) && !(await pg("S&P5000", sp)) && !(await pg("Dowager", sp)));
  // no words, no pattern (the server then asks for no headlines)
  ck("no words: no pattern", feed.wordsPg([]) === null && feed.wordsRegex([]) === null);
  console.log(fail ? `\n✗ ${fail} failed, ${pass} passed` : `\n✓ all ${pass} passed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
