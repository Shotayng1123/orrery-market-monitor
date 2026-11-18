# The guard of deploy-server.yml, read by jq from the CLI's `migration list --output-format json`:
#   { "migrations": [ { "local": "20261118000001", "remote": "" , ... }, ... ] }
# `local` is a migration file in the repository, `remote` the same version on the database's record; either is
# empty when the other side does not have it. A deploy applies every migration the database has no record of.
# That is only right when the record is complete: if the database was ever changed by hand, old migrations would
# look new and be run again. So the answer is OK only when what is waiting is strictly newer than everything
# applied; anything else begins with STOP and the deploy does not go on.
(.migrations // null) as $m
| if ($m | type) != "array" or ($m | length) == 0 then
    "STOP: could not read the list of migrations; run this workflow with check and look at its output"
  else
    ([$m[] | select((.remote // "") != "") | .remote]) as $applied
    | ([$m[] | select((.remote // "") == "" and (.local // "") != "") | .local]) as $waiting
    | ([$m[] | select((.local // "") == "" and (.remote // "") != "") | .remote]) as $unknown
    | ($applied | max // "") as $last
    | ([$waiting[] | select(. < $last)]) as $old
    | if ($applied | length) == 0 and ($waiting | length) > 0 then
        "STOP: the database has no record of any migration, but \($waiting | length) are in the repository: applying them all again would be wrong"
      elif ($unknown | length) > 0 then
        "STOP: the database has migrations the repository does not: \($unknown | join(" "))"
      elif ($old | length) > 0 then
        "STOP: waiting migrations older than the newest applied one (\($last)): \($old | join(" "))"
      elif ($waiting | length) > 0 then
        "OK: \($waiting | length) migration(s) waiting, all newer than \($last): \($waiting | join(" "))"
      else
        "OK: nothing waiting; the newest applied is \($last)"
      end
  end
