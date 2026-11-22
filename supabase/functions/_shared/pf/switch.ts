// The server's switch for the paper portfolio.
//
// P-1 to P-4a go live together: a paper book whose limits and ladder are not yet enforced would start a record under
// rules that change midway. Until P-4a is accepted this stays false, and every portfolio route of the API refuses
// ("Paper portfolios are not available yet.") before it reads or writes anything; the tables are deployed, empty.
// To turn the paper book on: set this to true here, and PAPER_ON_LIVE_SITE to true in web/src/lib/paper.ts, in the
// same pull request (README.md, "The paper portfolio's two switches"; supabase/README.md, "The paper portfolio").
export const PAPER_ON_SERVER = false;
