-- FINRA publishes a day's short-sale volume file in the evening, New York time. The job ran at 23:20 UTC on
-- weekdays, before the file was out, so the page was always a session behind and Friday's figures arrived on
-- Monday night. It now runs at 02:30 UTC from Tuesday to Saturday (the morning after each US session).
select cron.schedule('monitor-shorts', '30 2 * * 2-6', $c$select monitor_call('daily', 'job=shorts')$c$);
