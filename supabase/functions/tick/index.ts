// tick — every minute (pg_cron). For every instrument whose market is open (or closed within the last 45
// minutes, so the official closing level lands) it fetches the day's one-minute bars from the chart endpoint
// (a few requests at a time), writes quotes_latest and bars_intraday, then rebuilds the market table snapshot.
// Closed markets cost no Yahoo calls. If a chart call fails the spark endpoint (5-minute bars) is the fallback.
// The work itself is in _shared/tick.ts.
//
// Since 19 Nov 2026 the tick also reads how far behind its own answers are and leaves that on record. When they
// have stopped it asks GitHub for the relay (_shared/relay.ts), and while a relay is writing it stores nothing:
// it goes on pulling, so that it can tell when its answers are current again, and sends the notifications.
import { db, logRun, sourceErr } from "../_shared/db.ts";
import { isCron, json } from "../_shared/http.ts";
import { loadHolidays } from "../_shared/table.ts";
import { pushNewAlerts } from "../_shared/push.ts";
import { dueInstruments, printsOf, pull, store, tableAndAlerts, type Pulled } from "../_shared/tick.ts";
import { current, reading } from "../_shared/relay.ts";
import { relayOn, saveOwn } from "../_shared/relaystore.ts";

Deno.serve(async (req) => {
  if (!isCron(req)) return json(req, { error: "forbidden" }, 403);
  const t0 = Date.now(), now = new Date();
  try {
    const holidays = await loadHolidays();
    const due = await dueInstruments(now, holidays);
    // A pull that fails outright (the source refusing this machine) is read like one that brought nothing back:
    // not current, so the relay is asked for. The failure itself is still this run's result, further down.
    let got: Pulled[] = [], sparked = 0, pullErr: unknown = null;
    if (due.length) { try { ({ got, sparked } = await pull(due, "chart")); } catch (e) { pullErr = e; } }
    // how far behind this machine's own answers are: on record every minute, for the relay to read
    const own = reading(printsOf(got), due.length, now.getTime(), holidays);
    let ownNote = "";
    try { await saveOwn(own); } catch (e) { ownNote = `, own reading not saved: ${e instanceof Error ? e.message : e}`; }
    const behind = `${own.got}/${own.due} answered${own.lateMin != null ? `, ${own.lateMin} min behind` : ""}`;

    const relay = await relayOn(now.getTime());
    if (relay) {
      // one writer at a time: the relay holds the prices, the table and the alerts; notifications are sent from here
      let pushNote = "";
      try { pushNote = await pushNewAlerts(now); } catch (e) { pushNote = `, push failed: ${e instanceof Error ? e.message : e}`; }
      const detail = `standing down: prices are coming through GitHub (run ${relay.run ?? "?"}, since ${relay.since ?? "?"}); own answers: ${behind}${pushNote}${ownNote}`;
      await logRun("tick", true, detail, t0);
      return json(req, { ok: true, relay: true, detail });
    }
    if (!current(own)) {
      // this machine's answers have stopped: ask for the other path (at most once in ten minutes; nothing
      // happens without the GitHub token, and the relay's own schedule is then the way it starts)
      try { const { data, error } = await db.rpc("feed_relay_kick"); ownNote += `, own answers stopped (${behind}): relay ${error ? "not asked: " + error.message : data}`; }
      catch (e) { ownNote += `, relay not asked: ${e instanceof Error ? e.message : e}`; }
    }
    if (pullErr) throw new Error(`${pullErr instanceof Error ? pullErr.message : String(pullErr)}${ownNote}`);
    if (!due.length) {
      await logRun("tick", true, "idle: no market open" + ownNote, t0);
      return json(req, { ok: true, idle: true });
    }
    const st = await store(got, now);
    const { rows, note } = await tableAndAlerts(now, holidays);
    let alertNote = note;
    // new alerts, whichever job wrote them, go to the devices that asked for notifications
    try { alertNote += await pushNewAlerts(now); } catch (e) { alertNote += `, push failed: ${e instanceof Error ? e.message : e}`; }
    const missing = got.filter((g) => !g.ok).map((g) => g.i.symbol);
    const detail = `${st.quotes}/${due.length} quotes, ${st.bars} 1m bars, table ${rows} rows${sparked ? `, spark fallback for ${sparked}` : ""}${st.older ? `, ${st.older} older than the stored print left alone` : ""}${missing.length ? `, missing: ${missing.join(" ")}` : ""}${alertNote}${ownNote}`;
    await logRun("tick", true, detail, t0);
    return json(req, { ok: true, detail });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await sourceErr("yahoo", msg);
    await logRun("tick", false, msg, t0);
    return json(req, { ok: false, error: msg }, 500);
  }
});
