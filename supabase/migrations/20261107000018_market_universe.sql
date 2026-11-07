-- MARKET tab made comprehensive (Shota): more indices (Europe, Asia, EM), futures, volatility, majors and
-- minors in FX (minors only on RATES & CURRENCY), crypto, government yields derived from the stored curves,
-- more commodities; a market_tab flag (row in the MARKET table) and a chart flag (tile in the chart groups);
-- rolling statistics for the table (1M z-score, 52-week position, distance to the 200-day average).
alter table instruments drop constraint if exists instruments_cls_check;
alter table instruments add constraint instruments_cls_check check (cls in ('Equities','Volatility','Futures','Currency','Crypto','Fixed income','Commodities'));
alter table instruments drop constraint if exists instruments_provider_check;
alter table instruments add constraint instruments_provider_check check (provider in ('yahoo','treasury','mof','fred','curve'));
alter table instruments
  add column if not exists market_tab boolean not null default true,
  add column if not exists chart      boolean not null default true;

insert into instruments (ord, symbol, name, cls, grp, market, tz, currency, decimals, proxy_for, provider, provider_symbol, notes, market_tab, chart) values
  -- equities
  (42, '^NDX',      'Nasdaq 100',                   'Equities', 'equity', 'NYSE',  'America/New_York',   'USD', 2, null, 'yahoo', null, null, true, true),
  (43, '^STOXX',    'STOXX Europe 600',             'Equities', 'equity', 'XETRA', 'Europe/Berlin',      'EUR', 2, null, 'yahoo', null, null, true, true),
  (44, '^FCHI',     'CAC 40',                       'Equities', 'equity', 'XETRA', 'Europe/Paris',       'EUR', 2, null, 'yahoo', null, null, true, false),
  (45, '^SSMI',     'SMI',                          'Equities', 'equity', 'SIX',   'Europe/Zurich',      'CHF', 2, null, 'yahoo', null, null, true, false),
  (46, '^AXJO',     'S&P/ASX 200',                  'Equities', 'equity', 'ASX',   'Australia/Sydney',   'AUD', 2, null, 'yahoo', null, null, true, true),
  (47, '000300.SS', 'CSI 300',                      'Equities', 'equity', 'SSE',   'Asia/Shanghai',      'CNY', 2, null, 'yahoo', null, null, true, true),
  (48, '399001.SZ', 'Shenzhen Component',           'Equities', 'equity', 'SSE',   'Asia/Shanghai',      'CNY', 2, null, 'yahoo', null, null, true, false),
  (49, '^HSCE',     'Hang Seng China Enterprises',  'Equities', 'equity', 'HKEX',  'Asia/Hong_Kong',     'HKD', 2, null, 'yahoo', null, null, true, false),
  (50, '^KQ11',     'KOSDAQ',                       'Equities', 'equity', 'KRX',   'Asia/Seoul',         'KRW', 2, null, 'yahoo', null, null, true, false),
  (51, '^BVSP',     'Bovespa',                      'Equities', 'equity', 'B3',    'America/Sao_Paulo',  'BRL', 0, null, 'yahoo', null, null, true, false),
  (52, '^MXX',      'Mexico IPC',                   'Equities', 'equity', 'BMV',   'America/Mexico_City','MXN', 0, null, 'yahoo', null, null, true, false),
  -- futures and volatility
  (56, 'YM=F',      'Dow E-mini',                   'Futures',  'equity', 'CME',   'America/New_York',   'USD', 0, null, 'yahoo', null, null, true, false),
  (57, 'RTY=F',     'Russell 2000 E-mini',          'Futures',  'equity', 'CME',   'America/New_York',   'USD', 1, null, 'yahoo', null, null, true, false),
  (58, '^VXN',      'VXN (Nasdaq 100 volatility)',  'Volatility','equity','NYSE',  'America/New_York',   'USD', 2, null, 'yahoo', null, null, true, true),
  -- currency majors (MARKET tab) and minors (RATES & CURRENCY only)
  (59, 'CHF=X',     'USD/CHF',                      'Currency', 'fx',     'FX',    'Asia/Singapore',     'CHF', 4, null, 'yahoo', null, null, true, true),
  (60, 'CAD=X',     'USD/CAD',                      'Currency', 'fx',     'FX',    'Asia/Singapore',     'CAD', 4, null, 'yahoo', null, null, true, true),
  (61, 'NZDUSD=X',  'NZD/USD',                      'Currency', 'fx',     'FX',    'Asia/Singapore',     'USD', 4, null, 'yahoo', null, null, true, false),
  (62, 'GBPJPY=X',  'GBP/JPY',                      'Currency', 'fx',     'FX',    'Asia/Singapore',     'JPY', 2, null, 'yahoo', null, null, true, false),
  (63, 'AUDJPY=X',  'AUD/JPY',                      'Currency', 'fx',     'FX',    'Asia/Singapore',     'JPY', 2, null, 'yahoo', null, null, true, false),
  (64, 'TWD=X',     'USD/TWD',                      'Currency', 'fx',     'FX',    'Asia/Singapore',     'TWD', 2, null, 'yahoo', null, null, false, false),
  (65, 'INR=X',     'USD/INR',                      'Currency', 'fx',     'FX',    'Asia/Singapore',     'INR', 2, null, 'yahoo', null, null, false, false),
  (66, 'HKD=X',     'USD/HKD',                      'Currency', 'fx',     'FX',    'Asia/Singapore',     'HKD', 4, null, 'yahoo', null, null, false, false),
  (67, 'MXN=X',     'USD/MXN',                      'Currency', 'fx',     'FX',    'Asia/Singapore',     'MXN', 2, null, 'yahoo', null, null, false, false),
  (68, 'BRL=X',     'USD/BRL',                      'Currency', 'fx',     'FX',    'Asia/Singapore',     'BRL', 2, null, 'yahoo', null, null, false, false),
  (69, 'ZAR=X',     'USD/ZAR',                      'Currency', 'fx',     'FX',    'Asia/Singapore',     'ZAR', 2, null, 'yahoo', null, null, false, false),
  (70, 'TRY=X',     'USD/TRY',                      'Currency', 'fx',     'FX',    'Asia/Singapore',     'TRY', 2, null, 'yahoo', null, null, false, false),
  -- crypto
  (73, 'BTC-USD',   'Bitcoin',                      'Crypto',   'fx',     'CRYPTO','UTC',                'USD', 0, null, 'yahoo', null, null, true, true),
  (74, 'ETH-USD',   'Ethereum',                     'Crypto',   'fx',     'CRYPTO','UTC',                'USD', 0, null, 'yahoo', null, null, true, false),
  -- government yields from the stored curves (provider_symbol = country:years)
  (75, 'UST3M',     'UST 3M bill yield',            'Fixed income','rates','NYSE', 'America/New_York',   'USD', 3, null, 'curve', 'US:0.25', 'US Treasury daily par yield curve', true, false),
  (76, 'JGB2Y',     'JGB 2Y yield',                 'Fixed income','rates','TSE',  'Asia/Tokyo',         'JPY', 3, null, 'curve', 'JP:2',    'MOF reference yields', true, false),
  (77, 'JGB30Y',    'JGB 30Y yield',                'Fixed income','rates','TSE',  'Asia/Tokyo',         'JPY', 3, null, 'curve', 'JP:30',   'MOF reference yields', true, true),
  (78, 'DE2Y',      'Bund 2Y yield',                'Fixed income','rates','XETRA','Europe/Berlin',      'EUR', 3, null, 'curve', 'DE:2',    'Bundesbank term structure', true, false),
  (79, 'DE10Y',     'Bund 10Y yield',               'Fixed income','rates','XETRA','Europe/Berlin',      'EUR', 3, null, 'curve', 'DE:10',   'Bundesbank term structure', true, true),
  (80, 'GB10Y',     'Gilt 10Y yield',               'Fixed income','rates','LSE',  'Europe/London',      'GBP', 3, null, 'curve', 'GB:10',   'Bank of England nominal curve', true, true),
  (81, 'EA10Y',     'Euro area AAA 10Y yield',      'Fixed income','rates','XETRA','Europe/Berlin',      'EUR', 3, null, 'curve', 'EA:10',   'ECB AAA yield curve', true, false),
  (82, 'CA10Y',     'Canada 10Y yield',             'Fixed income','rates','NYSE', 'America/Toronto',    'CAD', 3, null, 'curve', 'CA:10',   'Bank of Canada', true, false),
  -- commodities
  (84, 'PL=F',      'Platinum',                     'Commodities','cmdty','CME',   'America/New_York',   'USD', 1, null, 'yahoo', null, null, true, false),
  (85, 'TIO=F',     'Iron ore 62% (TSI)',           'Commodities','cmdty','CME',   'America/New_York',   'USD', 2, null, 'yahoo', null, null, true, true),
  (86, 'ALI=F',     'Aluminium',                    'Commodities','cmdty','CME',   'America/New_York',   'USD', 1, null, 'yahoo', null, null, true, false)
on conflict (symbol) do update set name = excluded.name, cls = excluded.cls, grp = excluded.grp, market = excluded.market, tz = excluded.tz, currency = excluded.currency, decimals = excluded.decimals,
  provider = excluded.provider, provider_symbol = excluded.provider_symbol, notes = excluded.notes, market_tab = excluded.market_tab, chart = excluded.chart, active = true;

-- existing minors leave the MARKET table; the long tail of existing rows keeps its tile
update instruments set market_tab = false where symbol in ('KRW=X', 'SGD=X');

-- history for the curve-derived yields, from the curves already stored
insert into prices_daily (symbol, d, close, source, updated_at)
select i.symbol, c.d, c.yield, c.source, now()
from instruments i
join curves c on c.country = split_part(i.provider_symbol, ':', 1) and c.years = split_part(i.provider_symbol, ':', 2)::double precision
where i.provider = 'curve'
on conflict (symbol, d) do nothing;

-- rolling statistics per instrument for the table
create or replace function fn_table_stats()
returns table (symbol text, mean21 double precision, sd21 double precision, hi252 double precision, lo252 double precision, mean200 double precision)
language sql stable as $$
  with r as (
    select p.symbol, p.close, row_number() over (partition by p.symbol order by p.d desc) as rn
    from prices_daily p join instruments i on i.symbol = p.symbol and i.active
  )
  select symbol,
    avg(close) filter (where rn <= 21), stddev_samp(close) filter (where rn <= 21),
    max(close) filter (where rn <= 252), min(close) filter (where rn <= 252),
    avg(close) filter (where rn <= 200)
  from r where rn <= 252 group by symbol;
$$;
