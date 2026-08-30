create or replace function public._t(label text, uid text, sql text, expect text)
returns text language plpgsql as $$
declare
  err text; rows int; ok boolean;
begin
  begin
    execute 'set local role authenticated';
    perform set_config('request.jwt.claim.sub', uid, true);
    if uid is null then execute 'set local role anon'; end if;
    execute sql;
    get diagnostics rows = ROW_COUNT;
    err := null;
  exception when others then
    err := SQLERRM; rows := -1;
  end;
  execute 'set local role postgres';
  -- 'deny' passes on an error OR on 0 rows affected (RLS filters silently)
  if expect = 'deny' then ok := (err is not null or rows = 0);
  else ok := (err is null and rows <> 0);
  end if;
  return case when ok then '  PASS  ' else '**FAIL**' end || ' [' || expect || '] ' || label
       || case when err is not null then '  (' || split_part(err, E'\n', 1) || ')'
               else '  (rows=' || rows || ')' end;
end $$;
