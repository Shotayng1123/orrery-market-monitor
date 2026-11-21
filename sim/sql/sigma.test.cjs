// Moves in σ and a future's rolls (I-6 with B-27, 20 Nov 2026; supabase/migrations/20261120000001_sigma_moves.sql), on
// PGlite with the migration file itself. The market table's statistics the database works out (fn_table_stats) are set
// against the rule the server's code states (supabase/functions/_shared/sigma.ts sigmaStats, futures.ts rollSegments) on
// made-up series: a price, a yield, a future with a measured roll and one whose change of contract is not known. The
// tables the change alters (alerts, push_subs) are made from their own migrations; instruments and prices_daily with the
// columns the function reads (their migration needs pg_cron, which PGlite has not). From sim/sql:  npm test
const { PGlite } = require("@electric-sql/pglite");
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..", ".."), MIG = path.join(ROOT, "supabase", "migrations"), SHARED = path.join(ROOT, "supabase", "functions", "_shared");
let pass = 0, fail = 0;
const ck = (name, cond, detail) => { if (cond) { pass++; console.log("  ✓ " + name); } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  ->  " + JSON.stringify(detail) : "")); } };
const near = (a, b, tol = 1e-9) => a != null && b != null && Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
(async () => {
  const sigma = await import(path.join(SHARED, "sigma.ts")), futures = await import(path.join(SHARED, "futures.ts"));
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table instruments (symbol text primary key, name text not null default '', cls text not null default 'Futures', grp text not null, market text not null default 'CME', active boolean not null default true);
    create table prices_daily (symbol text not null references instruments(symbol), d date not null, close double precision not null, primary key (symbol, d));`);
  for (const f of ["20261107000005_alerts.sql", "20261115000002_news_alerts.sql", "20261118000001_push.sql"]) await db.exec(fs.readFileSync(path.join(MIG, f), "utf8"));
  const sql = fs.readFileSync(path.join(MIG, "20261120000001_sigma_moves.sql"), "utf8");
  let twice = true; try { await db.exec(sql); await db.exec(sql); } catch (e) { twice = e.message; }
  ck("the change applies, and applies again without an error", twice === true, twice);
  const one = async (q, v = []) => (await db.query(q, v)).rows[0];
  const all = async (q, v = []) => (await db.query(q, v)).rows;

  console.log("\n[what the probe of 20 Nov 2026 read, kept]");
  const seeds = await all("select symbol, d::text as d, from_contract, to_contract, prev_close, checked from fut_rolls order by symbol, d");
  const cl = seeds.filter((r) => r.symbol === "CL=F");
  ck(`${seeds.length} rolls: five of 20 Nov measured and to be checked (BZ, NG, HG, ALI, CL), ten earlier ones dated, their change of contract not known`, seeds.length === 15 && seeds.filter((r) => r.d === "2026-11-20" && r.prev_close != null && !r.checked).length === 5 && seeds.filter((r) => r.prev_close == null && r.checked).length === 10, seeds.length);
  ck("CL=F: on CLZ26.NYM from 21 Oct, on CLF27.NYM from 20 Nov, measured from January's own close of 19 Nov (82.44)", cl.length === 2 && cl[0].d === "2026-10-21" && cl[0].to_contract === "CLZ26.NYM" && cl[0].prev_close === null && cl[1].from_contract === "CLZ26.NYM" && cl[1].to_contract === "CLF27.NYM" && cl[1].prev_close === 82.44, cl);
  const recs = await all("select symbol, contract, expires::text as expires from fut_contracts where d = '2026-11-20' order by symbol");
  ck(`${recs.length} futures' contracts of 20 Nov, each with its own expiry (CL=F on CLF27.NYM, expiring 21 Dec 2026; none for TIO=F: its quote was from 2021, and the tick reads no quote unmoved for a week)`, recs.length === 14 && recs.find((r) => r.symbol === "CL=F")?.contract === "CLF27.NYM" && recs.find((r) => r.symbol === "CL=F")?.expires === "2026-12-21" && !recs.some((r) => r.symbol === "TIO=F") && recs.every((r) => r.expires), recs.map((r) => r.symbol));

  console.log("\n[the market table's statistics, against the server's own rule]");
  // weekdays from 2 Jan 2026, and a deterministic walk (about 1% a day)
  const days = []; for (let t = Date.UTC(2026, 0, 2); days.length < 300; t += 86400e3) { const wd = new Date(t).getUTCDay(); if (wd !== 0 && wd !== 6) days.push(new Date(t).toISOString().slice(0, 10)); }
  let v = 100; const walk = days.map((d, i) => { v *= 1 + (((i * 7919) % 97) / 97 - 0.5) * 0.035; return { d, close: Math.round(v * 1e4) / 1e4 }; });
  const yld = walk.map((x) => ({ d: x.d, close: Math.round((4 + (x.close - 100) / 50) * 1e5) / 1e5 }));
  const at = walk.length - 15, step = 1.03;   // a roll 15 sessions back: inside σ vs 1M avg's 21 closes and the 63 changes
  const fut = walk.map((x, i) => ({ d: x.d, close: Math.round((i < at ? x.close : x.close * step) * 1e4) / 1e4 }));
  const prevNew = Math.round(fut[at - 1].close * step * 1e4) / 1e4;   // the new contract's own close before the roll
  const put = async (symbol, grp, rows) => { await db.query("insert into instruments (symbol, grp) values ($1, $2)", [symbol, grp]); for (let k = 0; k < rows.length; k += 100) { const part = rows.slice(k, k + 100); await db.query(`insert into prices_daily (symbol, d, close) values ${part.map((_, j) => `($1, $${2 * j + 2}, $${2 * j + 3})`).join(",")}`, [symbol, ...part.flatMap((r) => [r.d, r.close])]); } };
  await put("TPRICE", "fx", walk); await put("TYIELD", "rates", yld); await put("TFUT=F", "cmdty", fut); await put("TCUT=F", "cmdty", fut);
  await db.query("insert into fut_rolls (symbol, d, from_contract, to_contract, prev_close, source) values ('TFUT=F', $1, 'TFUTZ26.CMX', 'TFUTG27.CMX', $2, 'stand-in'), ('TCUT=F', $1, null, 'TCUTG27.CMX', null, 'stand-in')", [fut[at].d, prevNew]);
  const st = Object.fromEntries((await all("select symbol, mean21, sd21, sd63, n63, from63::text as from63, to63::text as to63, sd63x, n63x, from63x::text as from63x, to63x::text as to63x, hi252, lo252, mean200 from fn_table_stats()")).map((r) => [r.symbol, r]));
  const want = (rows, units, rolls = []) => sigma.sigmaStats(rows, units, rolls);
  const same = (got, w, tag) => ck(`${tag}: σ of 63 changes ${got?.sd63?.toFixed(6)} (${got?.n63} changes, ${got?.from63} to ${got?.to63}) and of the 63 before the newest ${got?.sd63x?.toFixed(6)} (${got?.from63x} to ${got?.to63x}): the server's own rule to the ninth digit`,
    !!got && near(got.sd63, w.sd) && got.n63 === w.n && got.from63 === w.from && got.to63 === w.to && near(got.sd63x, w.sdx) && got.n63x === w.nx && got.from63x === w.fromx && got.to63x === w.tox, { got, w });
  same(st.TPRICE, want(walk, "price"), "a price (changes in per cent)");
  same(st.TYIELD, want(yld, "yield"), "a yield (changes in points of its level)");
  const rolls = [{ d: fut[at].d, prevClose: prevNew }];
  same(st["TFUT=F"], want(fut, "price", rolls), "a future with a measured roll (its change within the new contract)");
  const clean = fut.map((x, i) => ({ d: x.d, close: i < at ? x.close * (prevNew / fut[at - 1].close) : x.close }));
  ck("a future's σ with the step taken out of the series by hand is the same", near(st["TFUT=F"].sd63, sigma.sigmaStats(clean, "price").sd), { db: st["TFUT=F"].sd63, clean: sigma.sigmaStats(clean, "price").sd });
  same(st["TCUT=F"], want(fut, "price", [{ d: fut[at].d, prevClose: null }]), "a future whose change of contract is not known (its day left out)");
  ck("left out, that day leaves 62 changes in each window", st["TCUT=F"].n63 === 62 && st["TCUT=F"].n63x === 62, st["TCUT=F"]);
  // σ vs 1M avg: the last 21 closes, a future's set on its newest contract's level
  const seg = futures.rollSegments(fut.map((x) => ({ t: Date.parse(x.d + "T00:00:00Z") / 1000, c: x.close })), rolls)[0].slice(-21).map((b) => b.c);
  const m21 = seg.reduce((a, x) => a + x, 0) / 21, s21 = Math.sqrt(seg.reduce((a, x) => a + (x - m21) ** 2, 0) / 20);
  const p21 = walk.slice(-21).map((x) => x.close), mp = p21.reduce((a, x) => a + x, 0) / 21, sp = Math.sqrt(p21.reduce((a, x) => a + (x - mp) ** 2, 0) / 20);
  ck(`σ vs 1M avg: a price's mean and deviation of its last 21 closes, as before (${st.TPRICE.mean21.toFixed(4)}, ${st.TPRICE.sd21.toFixed(4)})`, near(st.TPRICE.mean21, mp) && near(st.TPRICE.sd21, sp), st.TPRICE);
  ck(`a future's last 21 closes set on the new contract's level (${st["TFUT=F"].mean21.toFixed(4)}, ${st["TFUT=F"].sd21.toFixed(4)}), as the server's rollSegments; one across a roll not measured has none`, near(st["TFUT=F"].mean21, m21) && near(st["TFUT=F"].sd21, s21) && st["TCUT=F"].mean21 === null && st["TCUT=F"].sd21 === null, { db: st["TFUT=F"], m21, s21, cut: st["TCUT=F"].mean21 });
  ck("the 52-week high and low and the 200-day mean are the series' own, as before (a roll leaves them as the source gives them)", near(st["TFUT=F"].hi252, Math.max(...fut.slice(-252).map((x) => x.close))) && near(st["TFUT=F"].mean200, fut.slice(-200).reduce((a, x) => a + x.close, 0) / 200));
  await db.query("update instruments set active = false where symbol = 'TCUT=F'");
  ck("an instrument no longer active is left out, as before", !(await all("select symbol from fn_table_stats()")).some((r) => r.symbol === "TCUT=F"));

  console.log("\n[alerts and devices]");
  const alert = (kind, sigmaV) => db.query("insert into alerts (d, symbol, name, kind, pct, price, market, msg, sigma, note) values ('2026-11-20', 'USDJPY=X', 'USD/JPY', $1, 1.9, 158.42, 'FX', 'USD/JPY +1.9% · 2.7σ · 158.420', $2, 'σ of 63 daily changes to 19 Nov 2026 · Yahoo Finance')", [kind, sigmaV]);
  await alert("sigma", 2.7);
  let noSigma = false; try { await db.query("insert into alerts (d, symbol, name, kind, pct, market, msg) values ('2026-11-20', 'EURUSD=X', 'EUR/USD', 'sigma', 0.4, 'FX', 'EUR/USD')"); } catch { noSigma = true; }
  let dup = false; try { await alert("sigma", 2.9); } catch { dup = true; }
  ck("a σ alert is kept with its σ and its note; one without its σ is refused; one per instrument, session and kind", (await one("select sigma, note from alerts where kind = 'sigma'")).sigma === 2.7 && noSigma && dup);
  let other = false; try { await db.query("insert into alerts (d, symbol, name, kind, pct, market, msg) values ('2026-11-20', 'X', 'X', 'guessed', 1, 'FX', 'X')"); } catch { other = true; }
  ck("the kinds of before are kept, and nothing else is taken", other && !!(await db.query("insert into alerts (d, symbol, name, kind, pct, market, msg) values ('2026-11-20', '7203.T', 'Toyota', 'stock', -7.2, 'TSE', 'Toyota down 7.2% intraday') returning id")).rows[0]);
  await db.query("insert into push_subs (user_id, endpoint, p256dh, auth) values ('a', 'https://fcm.googleapis.com/x', 'k', 'a')");
  const d0 = await one("select kinds, sigma_line from push_subs");
  ck("a device that exists keeps what it received (no kinds chosen: null) at the 2.5σ line", d0.kinds === null && d0.sigma_line === 2.5, d0);
  let badLine = false, badKind = false;
  try { await db.query("update push_subs set sigma_line = 2.7"); } catch { badLine = true; }
  try { await db.query("update push_subs set kinds = array['stock','guessed']"); } catch { badKind = true; }
  await db.query("update push_subs set kinds = array['stock','index','sigma'], sigma_line = 3");
  ck("a line of 2, 2.5 or 3 only, the six kinds only; a choice is kept", badLine && badKind && (await one("select sigma_line from push_subs")).sigma_line === 3);
  let badPrev = false; try { await db.query("insert into fut_rolls (symbol, d, to_contract, prev_close, source) values ('X=F', '2026-11-20', 'XZ26', 0, 's')"); } catch { badPrev = true; }
  ck("a roll's close before it is a price or nothing (zero is refused)", badPrev);

  console.log("\n" + (fail ? `✗ ${fail} failed, ${pass} passed` : `✓ all ${pass} passed`));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
