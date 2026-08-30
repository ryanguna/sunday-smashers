-- 0004_publish_draw_rpc.sql
--
-- Publishing a draw previously ran as `delete` followed by a separate multi-row
-- `insert` from the client, because supabase-js cannot open a transaction. If
-- the insert failed after the delete succeeded, the division was left with **no
-- fixtures at all** — on tournament day that is unrecoverable without a manual
-- rebuild.
--
-- This RPC does the whole swap inside a single server-side transaction, and
-- refuses to destroy anything that has already been played unless explicitly
-- forced.

create or replace function public.publish_draw(
  p_division_id uuid,
  p_stage public.match_stage,
  p_matches jsonb,
  p_force boolean default false
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  played_count integer;
  inserted_count integer;
begin
  if not public.is_admin() then
    raise exception 'Only admins may publish a draw'
      using errcode = 'insufficient_privilege';
  end if;

  -- Refuse to blow away results unless the admin has explicitly confirmed.
  select count(*) into played_count
    from public.matches m
   where m.division_id = p_division_id
     and m.stage = p_stage
     and (m.status <> 'scheduled' or m.score_a > 0 or m.score_b > 0);

  if played_count > 0 and not p_force then
    raise exception
      'Refusing to replace % match(es) in this division that already have results. Re-run with force to override.',
      played_count
      using errcode = 'raise_exception';
  end if;

  delete from public.matches
   where division_id = p_division_id
     and stage = p_stage;

  insert into public.matches (
    division_id, stage, round, bracket_key,
    team_a_id, team_b_id,
    points_to_win, deuce_enabled, cap,
    court_id, time_slot_id, next_match_id
  )
  select
    p_division_id,
    p_stage,
    (r ->> 'round')::integer,
    r ->> 'bracket_key',
    nullif(r ->> 'team_a_id', '')::uuid,
    nullif(r ->> 'team_b_id', '')::uuid,
    coalesce((r ->> 'points_to_win')::integer, 15),
    coalesce((r ->> 'deuce_enabled')::boolean, false),
    nullif(r ->> 'cap', '')::integer,
    nullif(r ->> 'court_id', '')::uuid,
    nullif(r ->> 'time_slot_id', '')::uuid,
    nullif(r ->> 'next_match_id', '')::uuid
  from jsonb_array_elements(p_matches) as r;

  get diagnostics inserted_count = row_count;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    auth.uid(),
    'draw.published',
    'division',
    p_division_id,
    jsonb_build_object(
      'stage', p_stage,
      'inserted', inserted_count,
      'replaced_played', played_count,
      'forced', p_force
    )
  );

  return inserted_count;
end;
$$;

revoke all on function public.publish_draw(uuid, public.match_stage, jsonb, boolean) from public, anon;
grant execute on function public.publish_draw(uuid, public.match_stage, jsonb, boolean) to authenticated;

comment on function public.publish_draw is
  'Atomically replaces all matches for a division+stage. Admin-only. Refuses to destroy played matches unless p_force.';
