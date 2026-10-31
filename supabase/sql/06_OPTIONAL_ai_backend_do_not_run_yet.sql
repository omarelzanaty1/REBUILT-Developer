-- ============================================================
-- REBUILT 0.4 — 06_OPTIONAL_ai_backend_do_not_run_yet.sql
--
-- *** NOT NEEDED FOR REBUILT 0.4. DO NOT RUN until the AI assistant is activated. ***
-- The REBUILT AI page is "Coming Soon": the app makes no AI calls and reads none
-- of these objects. This file only preserves the database part of the dormant AI
-- backend (Step 7 foundation) so it can be recreated in the new project later.
--
-- Contents (taken from the old REBUILT project's live schema):
--   user_weekly_schedule — the user's recurring weekly blocks (read by the ai-chat
--                          Edge Function). RECONSTRUCTED from the live catalog:
--                          the old project has no migration that created it, so its
--                          origin is unknown; confirm it is what you want before use.
--   ai_pending_proposals — AI proposals waiting for explicit user confirmation
--   confirm_ai_proposal  — the ONLY code path that executes a proposal (atomic, single-use)
--
-- Same hardening as 03: `to authenticated` policies, no anon table privileges.
-- Run after 01–03. One transaction.
-- ============================================================

begin;

-- DISABLED ON PURPOSE. This block stops the script before it creates anything.
-- Delete the next 3 lines ONLY when the AI assistant is deliberately being activated.
do $$ begin
  raise exception 'STOP: 06 is optional and NOT needed for REBUILT 0.4. Nothing was changed.';
end $$;

-- ---------- user_weekly_schedule ----------
create table public.user_weekly_schedule (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  day_of_week    text not null check (day_of_week in ('Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday')),
  start_time     time not null,
  end_time       time not null,
  activity_title text not null,
  category       text default 'general',
  is_active      boolean default true,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);
create index idx_user_weekly_schedule_user_day on public.user_weekly_schedule (user_id, day_of_week);
alter table public.user_weekly_schedule enable row level security;

create policy "Users can view their own weekly schedule" on public.user_weekly_schedule
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can insert their own weekly schedule" on public.user_weekly_schedule
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users can update their own weekly schedule" on public.user_weekly_schedule
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users can delete their own weekly schedule" on public.user_weekly_schedule
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.user_weekly_schedule from anon, authenticated;
grant select, insert, update, delete on public.user_weekly_schedule to authenticated;

-- ---------- ai_pending_proposals ----------
create table public.ai_pending_proposals (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  kind          text not null check (kind in ('bulk_schedule_create')),
  payload       jsonb not null check (jsonb_typeof(payload) = 'object'),
  status        text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled', 'expired')),
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default (now() + interval '20 minutes'),
  confirmed_at  timestamptz,
  result        jsonb
);
comment on table public.ai_pending_proposals is
  'AI-proposed bulk actions awaiting explicit user confirmation. A row here never writes anything by itself — only confirm_ai_proposal() does, atomically.';
create index ai_pending_proposals_user_status_idx on public.ai_pending_proposals (user_id, status);
alter table public.ai_pending_proposals enable row level security;

create policy "select own ai_pending_proposals" on public.ai_pending_proposals
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "insert own ai_pending_proposals" on public.ai_pending_proposals
  for insert to authenticated with check ((select auth.uid()) = user_id);
-- Deliberately NO update/delete policy: the only status change (pending -> confirmed,
-- together with the real write) happens inside confirm_ai_proposal().

revoke all on public.ai_pending_proposals from anon, authenticated;
grant select, insert on public.ai_pending_proposals to authenticated;

-- ---------- confirm_ai_proposal: atomic, single-use execution of a proposal ----------
create function public.confirm_ai_proposal(p_proposal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id      uuid := auth.uid();
  v_proposal     public.ai_pending_proposals%rowtype;
  v_item         jsonb;
  v_item_count   int;
  v_created_ids  uuid[] := '{}';
  v_new_id       uuid;
  v_inserted     int := 0;
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select * into v_proposal
  from public.ai_pending_proposals
  where id = p_proposal_id
    and user_id = v_user_id
  for update;

  if not found then
    raise exception 'proposal_not_found' using errcode = 'P0002';
  end if;

  if v_proposal.status = 'pending' and v_proposal.expires_at <= now() then
    update public.ai_pending_proposals set status = 'expired' where id = p_proposal_id;
    raise exception 'proposal_expired' using errcode = 'P0001';
  end if;

  if v_proposal.status <> 'pending' then
    raise exception 'proposal_not_pending: current status is %', v_proposal.status
      using errcode = 'P0001';
  end if;

  if v_proposal.kind <> 'bulk_schedule_create' then
    raise exception 'unsupported_proposal_kind: %', v_proposal.kind
      using errcode = 'P0001';
  end if;

  if coalesce(jsonb_typeof(v_proposal.payload -> 'items'), 'missing') <> 'array' then
    raise exception 'invalid_payload: items must be a JSON array' using errcode = 'P0001';
  end if;

  v_item_count := jsonb_array_length(v_proposal.payload -> 'items');

  if v_item_count = 0 then
    raise exception 'empty_items: at least one schedule item is required' using errcode = 'P0001';
  end if;

  if v_item_count > 100 then
    raise exception 'too_many_items: % items exceeds the maximum of 100', v_item_count
      using errcode = 'P0001';
  end if;

  for v_item in select * from jsonb_array_elements(v_proposal.payload -> 'items')
  loop
    if coalesce(trim(v_item ->> 'activity_title'), '') = '' then
      raise exception 'invalid_item: activity_title is required' using errcode = 'P0001';
    end if;

    if (v_item ->> 'day_of_week') is null
       or (v_item ->> 'day_of_week') not in
          ('Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday') then
      raise exception 'invalid_item: bad day_of_week (%)', (v_item ->> 'day_of_week')
        using errcode = 'P0001';
    end if;

    if (v_item ->> 'start_time') is null or (v_item ->> 'end_time') is null then
      raise exception 'invalid_item: start_time and end_time are required' using errcode = 'P0001';
    end if;

    if (v_item ->> 'start_time')::time >= (v_item ->> 'end_time')::time then
      raise exception 'invalid_item: start_time must be before end_time' using errcode = 'P0001';
    end if;

    insert into public.user_weekly_schedule
      (user_id, day_of_week, start_time, end_time, activity_title, category, is_active)
    values (
      v_user_id,
      v_item ->> 'day_of_week',
      (v_item ->> 'start_time')::time,
      (v_item ->> 'end_time')::time,
      trim(v_item ->> 'activity_title'),
      coalesce(nullif(trim(v_item ->> 'category'), ''), 'general'),
      true
    )
    returning id into v_new_id;

    v_created_ids := array_append(v_created_ids, v_new_id);
    v_inserted := v_inserted + 1;
  end loop;

  update public.ai_pending_proposals
    set status = 'confirmed',
        confirmed_at = now(),
        result = jsonb_build_object('created_ids', to_jsonb(v_created_ids), 'count', v_inserted)
    where id = p_proposal_id;

  return jsonb_build_object('ok', true, 'created_count', v_inserted, 'created_ids', to_jsonb(v_created_ids));
end;
$$;

comment on function public.confirm_ai_proposal(uuid) is
  'Single-use, atomic confirmation + execution of a pending AI proposal. SECURITY DEFINER is required only because ai_pending_proposals has no client-facing UPDATE policy by design.';

-- On Supabase, anon/authenticated get EXECUTE directly at creation, so name them.
revoke all on function public.confirm_ai_proposal(uuid) from public, anon;
grant execute on function public.confirm_ai_proposal(uuid) to authenticated;

commit;
