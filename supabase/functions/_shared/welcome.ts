// The welcome email (Shota, 19 Nov 2026): sent once, when a new account's password has been set. It opens with
// the idea behind the name, then says what the account opens: the six tabs, a company's own page, alerts,
// notifications on a phone and the watchlist. No network and no database here; the text is checked in
// sim/logic.test.ts and its picture of the page in web/e2e (welcome-mail).
//
// An email is read in programs that drop most of what a web page may use, so: tables for the layout, every style
// written on its element, no web fonts (the serif is the reader's own Times New Roman or Georgia), and three
// pictures fetched from the Monitor's own site (web/public/mail): the mark, the orrery and, since slice 11 (23 Nov
// 2026), the 1-minute tour's, which links to the tour's own page (web/public/tour). With pictures switched off the
// email still reads whole: nothing is said by a picture alone.
const esc = (t: string): string => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const WELCOME_SUBJECT = "Welcome to Orrery Monitor";

/** The idea behind the name. Kept to what is on record: the first such machines were made in London in the early
 *  1700s by the clockmakers George Graham and Thomas Tompion, and the name comes from the Earl of Orrery, for
 *  whom one was made. */
export const PHILOSOPHY = [
  "In the early 1700s, London clockmakers built a machine of brass wheels that set the solar system on a table. Set it turning and the planets circle the sun, each at its own pace, all at once.",
  "It was called an orrery. It took something too vast to see and made it small, simple and powerful: a model you could watch, and so understand.",
  "Markets are a system of that kind: thousands of prices, rates and currencies moving with and against one another, around the clock. The Orrery Monitor is a model of it. The whole on one screen, each part in its place, so you can see what moved, by how much, and why.",
];

/** The six tabs, in the order of the Monitor's own header: the address after the #, the name, and what is there. */
export const TABS: Array<[hash: string, name: string, what: string]> = [
  ["market", "MARKET", "Equities, volatility, futures, currencies, bonds and commodities in one table: the change over one day to three years, how unusual today's level is against the past month, and where it sits in its 52-week range."],
  ["news", "NEWS", "The economic calendar, company earnings dates and market headlines, in Singapore time."],
  ["research", "RESEARCH", "The Morning Note, Monday to Saturday around 07:00 SGT: what moved overnight, and why. The Weekly Strategy, Fridays at 15:00 SGT."],
  ["equities", "EQUITIES", "Seven indices from Tokyo to New York: breadth, sector performance and money flow, the movers, a heat map and a screener, with today's moves while the market is open."],
  ["rates", "RATES & CURRENCY", "Government yield curves, policy rates and the major currency pairs."],
  ["watch", "WATCHLIST", "Your own names, with their earnings dates, headlines, research that mentions them, and alerts."],
];

export const COMPANY = "Search a name or a ticker to open its page: the price against its usual range with volume, key data, performance against its index, short interest, the financial statements, and, for large companies, each big move with the reported reason and its sources.";
export const ALERTS = "The Monitor raises an alert when a stock moves 5% in a session (7% for smaller companies), when an index moves 3%, and on buybacks, guidance changes and deals of USD 1bn or more. The newest is always at the top of the screen.";
export const PHONE = "Add the Monitor to your Home Screen and it opens like an app. Then choose NOTIFICATIONS in its menu to get alerts as they happen: all of them, or only those on your watchlist.";
export const FIRST: string[] = [
  "Star the names you follow: in WATCHLIST, type part of a name or of a ticker and pick from the list.",
  "Read this morning's note in RESEARCH.",
  "On your phone, add the Monitor to the Home Screen and turn on notifications.",
];
export const HELP = "Every column, colour and badge is explained behind the ? in the Monitor's header (on a phone, in its menu).";
/** The 1-minute tour (the designer's work order, §5.2): the film the owner accepted on 23 Nov 2026, at {site}tour/. */
export const TOUR = "Start with the 1-minute tour: what each tab shows and what you can set, with captions and no sound.";
export const TOUR_LINK = "Watch the 1-minute tour";
export const TOUR_ALT = "Watch the 1-minute tour of Orrery Monitor: what each tab shows and what you can set, in a video with captions and no sound";
export const SMALL = "Orrery Monitor shows market data from third-party feeds that may be delayed or incomplete. Information only; nothing here is investment advice. This is the only email of its kind: it is sent once, when an account with this address first signs in.";

// colours of the Monitor itself (web/src/styles/tokens.css)
const BG = "#050505", PANEL = "#0c0c0c", LINE = "#26272b", TXT = "#e8e5de", TXT2 = "#c6c2b7", MUT = "#8f8b82", CORAL = "#ff6f61", BRASS = "#d8c49a";
const SERIF = "'Times New Roman',Times,Georgia,serif", SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif", MONO = "'SF Mono',Menlo,Consolas,'Courier New',monospace";

const label = (t: string): string => `<p style="margin:0 0 14px;font-family:${MONO};font-size:11px;line-height:1.4;letter-spacing:2.4px;text-transform:uppercase;color:${CORAL}">${esc(t)}</p>`;
const para = (t: string, last = false): string => `<p style="margin:0 0 ${last ? 0 : 14}px;font-family:${SANS};font-size:15px;line-height:1.6;color:${TXT2}">${esc(t)}</p>`;
const block = (inner: string, top = true): string => `<tr><td style="padding:30px 36px 28px;${top ? `border-top:1px solid ${LINE};` : ""}" class="om-pad">${inner}</td></tr>`;

/** The welcome email for the Monitor at `site` (its address, ending in a slash). */
export function welcomeMail(site: string): { subject: string; text: string; html: string } {
  const link = (hash: string): string => `${site}#${hash}`;
  const text = [
    ...PHILOSOPHY.flatMap((p) => [p, ""]),
    "WELCOME",
    "Your account is open. Everything below is ready the moment you sign in:",
    site,
    "",
    "WHAT YOU CAN SEE",
    ...TABS.map(([, name, what]) => `- ${name}: ${what}`),
    "",
    "ANY COMPANY",
    COMPANY,
    "",
    "ALERTS",
    ALERTS,
    "",
    "ON YOUR PHONE",
    PHONE,
    "",
    "A GOOD FIRST FIVE MINUTES",
    TOUR,
    `Watch it: ${site}tour/`,
    ...FIRST.map((s, i) => `${i + 1}. ${s}`),
    "",
    HELP,
    "",
    SMALL,
  ].join("\n");

  const tabs = TABS.map(([hash, name, what], i) => `<tr>
<td valign="top" style="padding:${i ? 13 : 0}px 16px ${i === TABS.length - 1 ? 0 : 13}px 0;${i ? `border-top:1px solid ${LINE};` : ""}font-family:${MONO};font-size:11.5px;line-height:1.6;letter-spacing:1.4px;white-space:nowrap" class="om-tab"><a href="${esc(link(hash))}" style="color:${TXT};text-decoration:none;font-weight:700">${esc(name)}</a></td>
<td valign="top" style="padding:${i ? 13 : 0}px 0 ${i === TABS.length - 1 ? 0 : 13}px;${i ? `border-top:1px solid ${LINE};` : ""}font-family:${SANS};font-size:14.5px;line-height:1.55;color:${TXT2}">${esc(what)}</td>
</tr>`).join("\n");
  const steps = FIRST.map((s, i) => `<tr>
<td valign="top" style="padding:0 14px ${i === FIRST.length - 1 ? 0 : 12}px 0;font-family:${SERIF};font-style:italic;font-size:22px;line-height:1.1;color:${CORAL}">${i + 1}</td>
<td valign="top" style="padding:0 0 ${i === FIRST.length - 1 ? 0 : 12}px;font-family:${SANS};font-size:15px;line-height:1.55;color:${TXT2}">${esc(s)}</td>
</tr>`).join("\n");

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${esc(WELCOME_SUBJECT)}</title>
<style>
@media (max-width:620px){
  .om-pad{padding-left:22px!important;padding-right:22px!important}
  .om-quote{font-size:19px!important;line-height:1.5!important}
  .om-tab{white-space:normal!important;width:92px}
  .om-brand{padding-left:22px!important;padding-right:22px!important}
}
</style>
</head>
<body style="margin:0;padding:0;background:${BG};color:${TXT}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${BG}">A model of the markets, small enough to see whole. Here is what your account opens.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BG}" style="background:${BG}">
<tr><td align="center" style="padding:28px 12px 40px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:${PANEL};border:1px solid ${LINE};border-radius:14px;overflow:hidden">

<tr><td class="om-brand" style="padding:22px 36px 18px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td valign="middle" style="padding-right:11px"><img src="${esc(site)}mail/mark.png" width="30" height="30" alt="" style="display:block;border:0;width:30px;height:30px"></td>
<td valign="middle" style="font-family:${SERIF};font-size:23px;line-height:1;letter-spacing:1.2px;color:${TXT}">Orrery Monitor</td>
</tr></table>
</td></tr>

<tr><td style="padding:0;background:${BG};line-height:0;font-size:0"><img src="${esc(site)}mail/orrery.png" width="600" alt="An orrery: a brass model of the planets on their orbits around the sun" style="display:block;border:0;width:100%;max-width:600px;height:auto;color:${MUT};font-family:${SERIF};font-style:italic;font-size:14px;line-height:1.4"></td></tr>

<tr><td class="om-pad" style="padding:34px 36px 32px">
${PHILOSOPHY.map((p, i) => `<p class="om-quote" style="margin:0 0 ${i === PHILOSOPHY.length - 1 ? 0 : 18}px;font-family:${SERIF};font-style:italic;font-size:21px;line-height:1.5;color:${i === PHILOSOPHY.length - 1 ? TXT : BRASS}">${esc(p)}</p>`).join("\n")}
</td></tr>

${block(`<p style="margin:0 0 10px;font-family:${SERIF};font-size:34px;line-height:1.1;color:${TXT}">Welcome.</p>
${para("Your account is open. Everything below is ready the moment you sign in.")}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:8px"><tr><td bgcolor="${CORAL}" style="background:${CORAL};border-radius:9px"><a href="${esc(site)}" style="display:inline-block;padding:14px 28px;font-family:${SANS};font-size:16px;font-weight:700;line-height:1;color:#141005;text-decoration:none;border-radius:9px">Open the Monitor&nbsp;&rarr;</a></td></tr></table>`)}

${block(`${label("What you can see")}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${tabs}
</table>`)}

${block(`${label("Any company")}
${para(COMPANY, true)}`)}

${block(`${label("Alerts")}
${para(ALERTS, true)}`)}

${block(`${label("On your phone")}
${para(PHONE, true)}`)}

${block(`${label("A good first five minutes")}
${para(TOUR, true)}`)}

<tr><td style="padding:0;background:${BG};line-height:0;font-size:0"><a href="${esc(site)}tour/" style="display:block;text-decoration:none"><img src="${esc(site)}mail/tour.jpg" width="600" alt="${esc(TOUR_ALT)}" style="display:block;border:0;width:100%;max-width:600px;height:auto;color:${MUT};font-family:${SANS};font-size:14px;line-height:1.4"></a></td></tr>

${block(`<p style="margin:0 0 20px;font-family:${SANS};font-size:15px;line-height:1.6"><a href="${esc(site)}tour/" style="color:${CORAL};font-weight:700;text-decoration:none">${esc(TOUR_LINK)}&nbsp;&rarr;</a></p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0">
${steps}
</table>
<p style="margin:20px 0 0;font-family:${SANS};font-size:13.5px;line-height:1.55;color:${MUT}">${esc(HELP)}</p>`, false)}

<tr><td class="om-pad" style="padding:22px 36px 26px;border-top:1px solid ${LINE};background:${BG}">
<p style="margin:0;font-family:${SANS};font-size:12px;line-height:1.6;color:${MUT}">${esc(SMALL)}</p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
  return { subject: WELCOME_SUBJECT, text, html };
}
