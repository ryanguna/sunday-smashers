-- Fixture: an admin, two players (alice/bob), an umpire (carol) rostered on
-- the match, and an unrelated outsider (dave).

-- admin, two players (alice/bob), an umpire rostered on the match (carol),
-- and an unrelated outsider (dave). The handle_new_user trigger creates the
-- matching public.profiles rows.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a0','admin@x.test'),
  ('00000000-0000-0000-0000-0000000000a1','alice@x.test'),
  ('00000000-0000-0000-0000-0000000000a2','bob@x.test'),
  ('00000000-0000-0000-0000-0000000000a3','carol@x.test'),
  ('00000000-0000-0000-0000-0000000000a4','dave@x.test')
on conflict (id) do nothing;

insert into public.user_roles (user_id, role) values ('00000000-0000-0000-0000-0000000000a0','admin') on conflict do nothing;

insert into public.tournaments (id, name, slug, tournament_date, registration_opens_at, registration_closes_at, is_published)
values ('00000000-0000-0000-0000-0000000000f1','SS','ss','2026-12-13','2026-09-06 00:00+00','2026-12-06 00:00+00',true);

insert into public.divisions (id, tournament_id, name, gender, is_published)
values ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000f1','Mens Doubles','mens',true),
       ('00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-0000000000f1','Womens Doubles','womens',false);

insert into public.teams (id, division_id, name, seed, is_confirmed) values
  ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000d1','Team One',5,false),
  ('00000000-0000-0000-0000-0000000000e2','00000000-0000-0000-0000-0000000000d1','Team Two',6,false);
insert into public.team_members (team_id, player_id) values
  ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000e2','00000000-0000-0000-0000-0000000000a2');

insert into public.courts (id, tournament_id, name) values ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000f1','Court 1');
insert into public.time_slots (id, tournament_id, starts_at, ends_at) values ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000f1','2026-12-13 09:00+00','2026-12-13 09:30+00');

insert into public.matches (id, division_id, stage, round, court_id, time_slot_id, team_a_id, team_b_id, points_to_win, status)
values ('00000000-0000-0000-0000-0000000000a9','00000000-0000-0000-0000-0000000000d1','elims',1,
        '00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000b1',
        '00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000e2',15,'scheduled');

insert into public.duty_assignments (match_id, player_id, duty_role)
values ('00000000-0000-0000-0000-0000000000a9','00000000-0000-0000-0000-0000000000a3','umpire_scorer');
