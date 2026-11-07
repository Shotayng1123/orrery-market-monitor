-- Exchange holidays checked against the publishers' own pages on 2026-11-07:
--   JPX  https://www.jpx.co.jp/english/corporate/about-jpx/calendar/index.html  (2026 and 2027 tables)
--   NYSE https://www.nyse.com/trade/hours-calendars                               (2026 and 2027 columns)
update sessions_cal set verified = true where market = 'TSE' and extract(year from d) = 2026;
update sessions_cal set verified = true where market = 'NYSE' and extract(year from d) = 2026;
insert into sessions_cal (market, d, name, verified) values
  ('TSE', '2027-01-01', 'New Year''s Day', true), ('TSE', '2027-01-11', 'Coming of Age Day', true),
  ('TSE', '2027-02-11', 'National Foundation Day', true), ('TSE', '2027-02-23', 'Emperor''s Birthday', true),
  ('TSE', '2027-03-22', 'Vernal Equinox (observed)', true), ('TSE', '2027-04-29', 'Showa Day', true),
  ('TSE', '2027-05-03', 'Constitution Memorial Day', true), ('TSE', '2027-05-04', 'Greenery Day', true), ('TSE', '2027-05-05', 'Children''s Day', true),
  ('TSE', '2027-07-19', 'Marine Day', true), ('TSE', '2027-08-11', 'Mountain Day', true),
  ('TSE', '2027-09-20', 'Respect for the Aged Day', true), ('TSE', '2027-09-23', 'Autumnal Equinox', true),
  ('TSE', '2027-10-11', 'Sports Day', true), ('TSE', '2027-11-03', 'Culture Day', true), ('TSE', '2027-11-23', 'Labor Thanksgiving Day', true),
  ('TSE', '2027-12-31', 'Market Holiday', true),
  ('NYSE', '2027-01-01', 'New Year''s Day', true), ('NYSE', '2027-01-18', 'Martin Luther King Jr. Day', true),
  ('NYSE', '2027-02-15', 'Presidents'' Day', true), ('NYSE', '2027-03-26', 'Good Friday', true),
  ('NYSE', '2027-05-31', 'Memorial Day', true), ('NYSE', '2027-06-18', 'Juneteenth (observed)', true),
  ('NYSE', '2027-07-05', 'Independence Day (observed)', true), ('NYSE', '2027-09-06', 'Labor Day', true),
  ('NYSE', '2027-11-25', 'Thanksgiving Day', true), ('NYSE', '2027-12-24', 'Christmas Day (observed)', true)
on conflict (market, d) do update set verified = true, name = excluded.name;
