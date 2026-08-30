\pset format unaligned
delete from scoresheet_signatures; delete from scoresheets; delete from score_events;
delete from registrations; delete from partner_invites; delete from audit_log; delete from photos;
delete from matches where id <> '00000000-0000-0000-0000-0000000000a9';
update matches set status='scheduled', winner_team_id=null, score_a=0, score_b=0, started_at=null, completed_at=null;
update teams set name='Team One', seed=5, is_confirmed=false where id='00000000-0000-0000-0000-0000000000e1';
\pset tuples_only on
\set A '''00000000-0000-0000-0000-0000000000a1'''
\set B '''00000000-0000-0000-0000-0000000000a2'''
\set C '''00000000-0000-0000-0000-0000000000a3'''
\set D '''00000000-0000-0000-0000-0000000000a4'''

select '--- C1: registration self-approval ---';
select public._t('C1 alice inserts registration status=approved + forged reviewer', :A,
  $q$insert into registrations (tournament_id,division_id,player_id,status,reviewed_by)
     values ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000d1',
             '00000000-0000-0000-0000-0000000000a1','approved','00000000-0000-0000-0000-0000000000a0')$q$, 'deny');
select public._t('C1 alice inserts a normal pending registration', :A,
  $q$insert into registrations (tournament_id,division_id,player_id,status)
     values ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000d1',
             '00000000-0000-0000-0000-0000000000a1','pending')$q$, 'allow');

select '--- C2/B3: the umpire can actually run the match ---';
select public._t('C2 carol starts the match (scheduled -> in_progress)', :C,
  $q$update matches set status='in_progress', started_at=now() where id='00000000-0000-0000-0000-0000000000a9'$q$, 'allow');
insert into score_events (match_id,sequence,side,event_type,score_a_after,score_b_after,scored_by)
  values ('00000000-0000-0000-0000-0000000000a9',1,'a','point',1,0,'00000000-0000-0000-0000-0000000000a3');
select public._t('C3 carol clears score_events mid-match (the 2nd-save bug)', :C,
  $q$delete from score_events where match_id='00000000-0000-0000-0000-0000000000a9'$q$, 'allow');
select public._t('B3 carol records a WALKOVER', :C,
  $q$update matches set status='walkover', winner_team_id='00000000-0000-0000-0000-0000000000e1' where id='00000000-0000-0000-0000-0000000000a9'$q$, 'allow');
update matches set status='in_progress', winner_team_id=null where id='00000000-0000-0000-0000-0000000000a9';
select public._t('B3 carol records a RETIREMENT', :C,
  $q$update matches set status='retired', winner_team_id='00000000-0000-0000-0000-0000000000e1' where id='00000000-0000-0000-0000-0000000000a9'$q$, 'allow');

select '--- H5: the umpire must not be able to rewrite the fixture ---';
select public._t('H5 carol changes points_to_win to 1', :C,
  $q$update matches set points_to_win=1 where id='00000000-0000-0000-0000-0000000000a9'$q$, 'deny');
select public._t('H5 carol swaps out a team', :C,
  $q$update matches set team_b_id=null where id='00000000-0000-0000-0000-0000000000a9'$q$, 'deny');
select public._t('H5 carol moves the match off its court', :C,
  $q$update matches set court_id=null where id='00000000-0000-0000-0000-0000000000a9'$q$, 'deny');

select '--- H2: seeding ---';
select public._t('H2 alice seeds her own pair #1', :A,
  $q$update teams set seed=1 where id='00000000-0000-0000-0000-0000000000e1'$q$, 'deny');
select public._t('H2 alice confirms her own pair', :A,
  $q$update teams set is_confirmed=true where id='00000000-0000-0000-0000-0000000000e1'$q$, 'deny');
select public._t('H2 alice renames her own team (should still work)', :A,
  $q$update teams set name='Tinsel Smashers' where id='00000000-0000-0000-0000-0000000000e1'$q$, 'allow');

select '--- H1: forged invites ---';
select public._t('H1 alice self-issues an ACCEPTED invite', :A,
  $q$insert into partner_invites (division_id,inviter_id,invitee_email,status)
     values ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000a1','ghost@x.test','accepted')$q$, 'deny');
select public._t('H1 alice inserts a team directly', :A,
  $q$insert into teams (division_id,name) values ('00000000-0000-0000-0000-0000000000d1','Ghost Team')$q$, 'deny');

select '--- H3/H6/M1: content and scoresheet forgery ---';
select public._t('H3 alice publishes a pre-approved featured photo', :A,
  $q$insert into photos (uploaded_by,storage_path,moderation_status,is_featured)
     values ('00000000-0000-0000-0000-0000000000a1','g/x.jpg','approved',true)$q$, 'deny');
select public._t('H6 carol files a pre-VERIFIED scoresheet', :C,
  $q$insert into scoresheets (match_id,status,verified_by)
     values ('00000000-0000-0000-0000-0000000000a9','verified','00000000-0000-0000-0000-0000000000a0')$q$, 'deny');
select public._t('H6 carol files a normal draft scoresheet', :C,
  $q$insert into scoresheets (match_id,status) values ('00000000-0000-0000-0000-0000000000a9','draft')$q$, 'allow');
update scoresheets set status='awaiting_signature' where match_id='00000000-0000-0000-0000-0000000000a9';
select public._t('M1 dave (not in this match) signs the scoresheet', :D,
  $q$insert into scoresheet_signatures (scoresheet_id,player_id)
     select id,'00000000-0000-0000-0000-0000000000a4' from scoresheets where match_id='00000000-0000-0000-0000-0000000000a9'$q$, 'deny');
select public._t('M1 alice (a player in the match) signs it', :A,
  $q$insert into scoresheet_signatures (scoresheet_id,player_id)
     select id,'00000000-0000-0000-0000-0000000000a1' from scoresheets where match_id='00000000-0000-0000-0000-0000000000a9'$q$, 'allow');
select public._t('M2 alice withdraws her own signature (sheet is awaiting_signature, not draft)', :A,
  $q$delete from scoresheet_signatures where player_id='00000000-0000-0000-0000-0000000000a1'$q$, 'allow');

update scoresheets set status='disputed' where match_id='00000000-0000-0000-0000-0000000000a9';
select public._t('H6b carol corrects a DISPUTED sheet sent back by the tabulator', :C,
  $q$update scoresheets set status='awaiting_signature' where match_id='00000000-0000-0000-0000-0000000000a9'$q$, 'allow');
select public._t('H6b carol cannot self-verify a disputed sheet', :C,
  $q$update scoresheets set status='verified', verified_by='00000000-0000-0000-0000-0000000000a0' where match_id='00000000-0000-0000-0000-0000000000a9'$q$, 'deny');

select '--- M3: audit log ---';
select public._t('M3 carol (non-admin) writes an audit entry', :C,
  $q$insert into audit_log (actor_id,action,entity_type) values ('00000000-0000-0000-0000-0000000000a3','verify','scoresheet')$q$, 'allow');
select public._t('M3 carol forges an audit entry as the admin', :C,
  $q$insert into audit_log (actor_id,action,entity_type) values ('00000000-0000-0000-0000-0000000000a0','verify','scoresheet')$q$, 'deny');

select '--- Data integrity (as organiser/postgres) ---';
do $x$ begin
  begin
    insert into matches (division_id,stage,round,court_id,time_slot_id,team_a_id,team_b_id)
    values ('00000000-0000-0000-0000-0000000000d1','elims',2,'00000000-0000-0000-0000-0000000000c1',
            '00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000e2');
    raise notice '**FAIL** [deny] INT double-booked court+slot was ACCEPTED';
  exception when others then raise notice '  PASS   [deny] INT double-booked court+slot (%)', split_part(SQLERRM,E'\n',1);
  end;
  begin
    update matches set status='completed', score_a=47, score_b=3,
      winner_team_id='00000000-0000-0000-0000-0000000000e1' where id='00000000-0000-0000-0000-0000000000a9';
    raise notice '**FAIL** [deny] INT score 47 above the cap was ACCEPTED';
  exception when others then raise notice '  PASS   [deny] INT score above cap (%)', split_part(SQLERRM,E'\n',1);
  end;
  begin
    update matches set status='completed', score_a=15, score_b=3,
      winner_team_id='00000000-0000-0000-0000-0000000000e2' where id='00000000-0000-0000-0000-0000000000a9';
    raise notice '**FAIL** [deny] INT winner contradicting the score was ACCEPTED';
  exception when others then raise notice '  PASS   [deny] INT winner must match the score (%)', split_part(SQLERRM,E'\n',1);
  end;
end $x$;
