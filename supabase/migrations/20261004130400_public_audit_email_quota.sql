create table if not exists public.public_audit_email_challenges (
  email_hash text primary key,
  code_hash text,
  code_expires_at timestamptz,
  attempts integer not null default 0,
  verification_token_hash text,
  verified_until timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists public_audit_email_challenges_created_at_idx
  on public.public_audit_email_challenges (created_at);

alter table public.public_audit_email_challenges enable row level security;
drop policy if exists public_audit_email_challenges_deny_all on public.public_audit_email_challenges;
create policy public_audit_email_challenges_deny_all
  on public.public_audit_email_challenges
  for all using (false) with check (false);
revoke all on public.public_audit_email_challenges from anon, authenticated;
grant select, insert, update, delete on public.public_audit_email_challenges to service_role;

create table if not exists public.public_audit_submissions (
  email_hash text not null,
  month_start date not null,
  submission_id uuid not null,
  email_sent boolean not null default false,
  lead_created boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (email_hash, month_start, submission_id)
);

create index if not exists public_audit_submissions_month_start_idx
  on public.public_audit_submissions (month_start);

alter table public.public_audit_submissions enable row level security;
drop policy if exists public_audit_submissions_deny_all on public.public_audit_submissions;
create policy public_audit_submissions_deny_all
  on public.public_audit_submissions
  for all using (false) with check (false);
revoke all on public.public_audit_submissions from anon, authenticated;
grant select, insert, update, delete on public.public_audit_submissions to service_role;

create or replace function public.verify_public_audit_email(
  p_email_hash text,
  p_code_hash text,
  p_token_hash text,
  p_token_expires_at timestamptz
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_challenge public.public_audit_email_challenges%rowtype;
begin
  select * into v_challenge
  from public.public_audit_email_challenges
  where email_hash = p_email_hash
  for update;

  if not found
    or v_challenge.code_hash is null
    or v_challenge.code_expires_at <= now()
    or v_challenge.attempts >= 5 then
    return 'invalid';
  end if;

  if v_challenge.code_hash <> p_code_hash then
    update public.public_audit_email_challenges
      set attempts = attempts + 1
      where email_hash = p_email_hash;
    return 'invalid';
  end if;

  update public.public_audit_email_challenges
    set code_hash = null,
        verification_token_hash = p_token_hash,
        verified_until = p_token_expires_at
    where email_hash = p_email_hash;

  return 'verified';
end;
$$;

create or replace function public.authorize_public_audit_submission(
  p_email_hash text,
  p_token_hash text,
  p_submission_id uuid,
  p_operation text
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_month_start date := date_trunc('month', now() at time zone 'UTC')::date;
  v_submission public.public_audit_submissions%rowtype;
  v_count integer;
begin
  if p_operation not in ('email', 'lead') then
    return 'invalid';
  end if;

  if not exists (
    select 1
    from public.public_audit_email_challenges
    where email_hash = p_email_hash
      and verification_token_hash = p_token_hash
      and verified_until > now()
  ) then
    return 'unverified';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_email_hash, 0));

  select * into v_submission
  from public.public_audit_submissions
  where email_hash = p_email_hash
    and month_start = v_month_start
    and submission_id = p_submission_id
  for update;

  if found then
    if (p_operation = 'email' and v_submission.email_sent)
      or (p_operation = 'lead' and v_submission.lead_created) then
      return 'duplicate';
    end if;

    update public.public_audit_submissions
      set email_sent = email_sent or p_operation = 'email',
          lead_created = lead_created or p_operation = 'lead'
      where email_hash = p_email_hash
        and month_start = v_month_start
        and submission_id = p_submission_id;
    return 'ok';
  end if;

  select count(*) into v_count
  from public.public_audit_submissions
  where email_hash = p_email_hash
    and month_start = v_month_start;

  if v_count >= 5 then
    return 'quota';
  end if;

  insert into public.public_audit_submissions (
    email_hash, month_start, submission_id, email_sent, lead_created
  ) values (
    p_email_hash,
    v_month_start,
    p_submission_id,
    p_operation = 'email',
    p_operation = 'lead'
  );

  return 'ok';
end;
$$;

revoke all on function public.verify_public_audit_email(text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.verify_public_audit_email(text, text, text, timestamptz) to service_role;
revoke all on function public.authorize_public_audit_submission(text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.authorize_public_audit_submission(text, text, uuid, text) to service_role;
