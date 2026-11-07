-- Economic calendar from FXStreet's calendar API (all countries, consensus / previous / actual, better-or-worse
-- flag), ForexFactory kept as the fallback. Events carry a stable external id so actuals update in place.
alter table econ_events
  add column if not exists currency text,
  add column if not exists better   boolean,          -- actual better than consensus (null when not applicable)
  add column if not exists kind     text;             -- 'release' | 'speech' | 'report' | 'allday'
create index if not exists econ_events_at on econ_events (at);
