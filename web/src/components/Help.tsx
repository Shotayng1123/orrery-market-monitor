import { useEffect, useState } from "react";

/** The legend behind the "?" in the header: what every column, colour and badge on the Monitor means, in one
 *  place and readable on a phone (the same explanations otherwise sit in hover tooltips, which a phone lacks). */
const SECTIONS: Array<{ title: string; rows: Array<[string, string]> }> = [
  { title: "Market table", rows: [
    ["1D to 36M", "Change from the close at the start of that window to the last print. Per cent for prices, basis points for yields."],
    ["σ 1M", "How far the last print sits from its 21-session average, in standard deviations. Beyond ±2 is an unusual level for the past month."],
    ["52W", "Where the last print sits in its 52-week range: 0 is the low, 100 the high."],
    ["vs 200d", "Distance from the 200-day average. Per cent for prices, percentage points for yields."],
    ["Shaded cells", "Green for a rise, red for a fall; the stronger the colour, the larger the move. Shaded cells are lettered in white."],
    ["PROXY", "An instrument that stands in for another, for example the 1306.T ETF for TOPIX during the session."],
    ["LIVE / CLOSED / ~15m", "Whether the instrument's market is open, and how delayed its feed is."],
  ] },
  { title: "Charts", rows: [
    ["Lines", "Grey is the rolling mean, blue the ±1σ band, amber the ±2σ band, over the Σ WINDOW chosen at the top."],
    ["PERIOD", "1D uses one-minute bars, 1W fifteen-minute bars, 1M hourly bars, 3M and longer daily closes."],
    ["Moving back", "Drag a chart to move back in time; double-click to return to the latest."],
  ] },
  { title: "Equities", rows: [
    ["Market breadth", "How many index members rose or fell over each window, their median and average move, and how many sat above their 50- and 200-day averages at the start of the window."],
    ["1D flow by sector", "Turnover is the value traded today. Share % is the sector's part of the index's turnover; Avg % its usual part; Δ pp the difference. Day / avg is today's turnover against the three-month average."],
    ["Net flow 1D", "Today's turnover signed by the move from the previous close and scaled by the day's range, capped at the full turnover. One session only: it does not follow PERIOD."],
    ["Sector performance", "GICS sectors, weighted by index weight where published, otherwise by market capitalisation."],
    ["Heat map", "Each tile is a company: size is market capitalisation, colour the 1D move."],
    ["Short interest", "Japan: short-selling share of TSE turnover and reported short positions of 0.5% and more (JPX). United States: short-sale volume share (FINRA)."],
    ["STAND-IN", "A narrower index whose members stand in for a broader one, for example the Nasdaq-100 for the Nasdaq Composite."],
  ] },
  { title: "Alerts", rows: [
    ["Moves", "A single stock beyond ±7% intraday, or an index beyond ±3%, against the previous close. The time is the minute the threshold was passed."],
    ["Buyback, guidance", "Raised from headlines, for companies worth USD 5bn or more."],
    ["M&A", "Raised from headlines that state a deal size of USD 1bn or more."],
    ["NEW ALERT", "An alert you have not opened yet, raised in the last half hour."],
  ] },
  { title: "Research", rows: [
    ["Daily", "The morning note, Monday to Saturday around 07:00 SGT: the news behind the overnight moves."],
    ["Weekly", "Emma's Weekly Strategy, Fridays at 15:00 SGT."],
    ["[n]", "A numbered source; the list is at the end of each piece."],
    ["(E)", "An estimate or a judgement, not a sourced fact."],
    ["Coloured names", "Open that instrument's page."],
  ] },
  { title: "Data and timing", rows: [
    ["Quotes", "Refreshed every minute while a market is open. Most exchange feeds are delayed by 15 to 20 minutes."],
    ["Daily closes", "Booked after each market's close. A currency pair's day ends at 17:00 New York."],
    ["Curves", "Official sources. Japan, the euro area, the UK and Canada publish a day late."],
    ["DATA OK", "Green when the minute and daily jobs have run on time. Hover or tap for the detail."],
    ["Keys", "1 to 6 switch tabs; / jumps to search; Esc leaves full screen."],
  ] },
];

export function Help() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open]);
  return (
    <>
      <span id="help-ctl" className="chip-sm" title="What the columns, colours and badges mean" onClick={() => setOpen(true)}>?</span>
      {open && (
        <div className="helpwrap" onClick={() => setOpen(false)}>
          <div className="helpbox" onClick={(e) => e.stopPropagation()}>
            <div className="helphead"><b>HOW TO READ THE MONITOR</b><span className="chip-sm" onClick={() => setOpen(false)}>CLOSE</span></div>
            <div className="helpbody">
              {SECTIONS.map((s) => (
                <div key={s.title} className="helpsec">
                  <h4>{s.title}</h4>
                  <dl>{s.rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
