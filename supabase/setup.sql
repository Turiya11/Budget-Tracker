-- Budget Tracker: Supabase setup
-- Run this once in your Supabase project: SQL Editor → New query → paste → Run.
-- Safe to run again; it only creates what's missing and replaces the functions.
--
-- How it's protected: the tables are closed to the public API key (row level security,
-- no policies). The only way in is through the functions below, and every one of them
-- checks the device secret that the app generates and stores only as a SHA-256 hash.

create table if not exists public.bt_config (
  id int primary key default 1 check (id = 1),
  secret_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.bt_inbox (
  id bigint generated always as identity primary key,
  body text not null,
  sender text,
  body_hash text not null,
  amount numeric,
  is_debit boolean,
  category text,
  in_budget boolean not null default true,
  ignored boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists bt_inbox_hash_idx on public.bt_inbox (body_hash, created_at);

create table if not exists public.bt_snapshot (
  id int primary key default 1 check (id = 1),
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.bt_config enable row level security;
alter table public.bt_inbox enable row level security;
alter table public.bt_snapshot enable row level security;
revoke all on public.bt_config, public.bt_inbox, public.bt_snapshot from anon, authenticated;

-- ---------- helpers ----------

create or replace function public.bt_hash(p text)
returns text language sql immutable set search_path = public as $$
  select encode(sha256(convert_to(coalesce(p, ''), 'UTF8')), 'hex')
$$;

create or replace function public.bt_require(p_secret text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_secret is null or length(p_secret) < 16
     or not exists (select 1 from bt_config where secret_hash = bt_hash(p_secret)) then
    raise exception 'bad_secret' using errcode = '28000';
  end if;
end $$;

-- Indian digit grouping: 1234567 -> ₹12,34,567
create or replace function public.bt_inr(n numeric)
returns text language plpgsql immutable set search_path = public as $$
declare
  s text := round(abs(coalesce(n, 0)))::bigint::text;
  head text; tail text;
begin
  if length(s) > 3 then
    tail := right(s, 3);
    head := left(s, length(s) - 3);
    head := regexp_replace(head, '(\d)(?=(\d\d)+$)', '\1,', 'g');
    s := head || ',' || tail;
  end if;
  return '₹' || s;
end $$;

-- ---------- API ----------

-- First call from the app links this database to its secret.
create or replace function public.bt_claim(p_secret text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if p_secret is null or length(p_secret) < 16 then
    raise exception 'bad_secret' using errcode = '28000';
  end if;
  if not exists (select 1 from bt_config) then
    insert into bt_config (id, secret_hash) values (1, bt_hash(p_secret));
    return jsonb_build_object('ok', true, 'claimed', true);
  end if;
  if exists (select 1 from bt_config where secret_hash = bt_hash(p_secret)) then
    return jsonb_build_object('ok', true, 'claimed', false);
  end if;
  raise exception 'secret_mismatch' using errcode = '28000';
end $$;

-- Called by the iPhone Shortcut for every bank SMS. Stores it and returns a notification.
create or replace function public.bt_capture(p_secret text, p_body text, p_sender text default null, p_dry_run boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_body text := left(coalesce(p_body, ''), 2000);
  v_low text;
  v_hash text;
  v_amount numeric;
  v_d int; v_c int;
  v_debit boolean;
  v_ignored boolean;
  v_sum jsonb;
  v_has_sum boolean;
  v_month text;
  v_cat text;
  v_cat_name text;
  v_in_budget boolean;
  v_limit numeric; v_cat_spent numeric;
  v_budget numeric; v_spent numeric; v_warn numeric; v_large numeric;
  v_bpct int; v_cpct int;
  v_title text;
  v_lines text[] := '{}';
begin
  perform bt_require(p_secret);
  if length(btrim(v_body)) = 0 then
    return jsonb_build_object('ok', false, 'title', '', 'body', '');
  end if;
  v_low := lower(v_body);
  v_hash := md5(v_body);

  -- Two automations can fire for the same SMS (e.g. "debited" and "credited").
  if not p_dry_run and exists (select 1 from bt_inbox where body_hash = v_hash and created_at > now() - interval '30 minutes') then
    return jsonb_build_object('ok', true, 'duplicate', true, 'title', '', 'body', '');
  end if;

  v_ignored := v_low ~ '(\motp\M|one[- ]time password|will be debited|to be debited|is due|due on|\mrequested\M|collect request|\mfailed\M|declined|unsuccessful|insufficient)';
  v_d := regexp_instr(v_low, '(debited|\msent\M|\mspent\M|\mpaid\M|withdrawn|withdrawal|purchase|deducted)');
  v_c := regexp_instr(v_low, '(credited|\mreceived\M|deposited|refund|reversed|reversal|cashback)');
  if v_d = 0 and v_c = 0 then v_ignored := true; end if;
  v_debit := v_d > 0 and (v_c = 0 or v_d <= v_c);

  v_amount := nullif(replace(substring(v_low from '(?:rs\.?|inr|₹)\s*:?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)'), ',', ''), '')::numeric;
  if v_amount is null then
    v_amount := nullif(replace(substring(v_low from '(?:debited|credited)\s+(?:by|with|for)\s+([0-9][0-9,]*(?:\.[0-9]{1,2})?)'), ',', ''), '')::numeric;
  end if;

  select data -> 'summary' into v_sum from bt_snapshot where id = 1;
  v_sum := coalesce(v_sum, '{}'::jsonb);
  v_has_sum := v_sum ? 'month';
  v_month := to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM');

  if v_debit then
    select r.value ->> 'c' into v_cat
    from jsonb_array_elements(coalesce(v_sum -> 'rules', '[]'::jsonb)) with ordinality as r(value, ord)
    where length(coalesce(r.value ->> 'k', '')) > 0
      and v_low ~ ('(^|[^a-z0-9])' || regexp_replace(lower(r.value ->> 'k'), '([.*+?()|^$])', '\\\1', 'g') || '([^a-z0-9]|$)')
    order by r.ord
    limit 1;
    if v_cat is null then
      v_cat := case when v_low ~ '(\mnach\M|ach d|iccl|indian clearing|mutual fund)' then 'investments' else 'other' end;
    end if;
    if v_has_sum then
      v_in_budget := exists (select 1 from jsonb_array_elements(coalesce(v_sum -> 'categories', '[]'::jsonb)) c where c ->> 'id' = v_cat);
    else
      v_in_budget := v_cat not in ('investments', 'income');
    end if;
  else
    v_cat := 'income';
    v_in_budget := false;
  end if;
  v_cat_name := coalesce(v_sum -> 'names' ->> v_cat, initcap(v_cat));

  if not p_dry_run then
    insert into bt_inbox (body, sender, body_hash, amount, is_debit, category, in_budget, ignored)
    values (v_body, left(p_sender, 64), v_hash, v_amount, v_debit, v_cat, v_in_budget, v_ignored);
  end if;

  if v_ignored then
    return jsonb_build_object('ok', true, 'ignored', true, 'title', '', 'body', '');
  end if;
  if v_amount is null then
    return jsonb_build_object('ok', true, 'title', 'Bank SMS saved', 'body', 'Open Budget Tracker to review it.');
  end if;
  if not v_debit then
    return jsonb_build_object('ok', true, 'title', bt_inr(v_amount) || ' received', 'body', 'Logged as money in.', 'amount', v_amount, 'category', v_cat);
  end if;
  if not v_in_budget then
    return jsonb_build_object('ok', true, 'title', bt_inr(v_amount) || ' · ' || v_cat_name, 'body', 'Logged. Not counted in your spending budget.', 'amount', v_amount, 'category', v_cat);
  end if;

  -- Totals = what the app last synced for this month + SMS not yet pulled into the app.
  v_budget := coalesce((v_sum ->> 'budget')::numeric, 0);
  v_warn := coalesce((v_sum ->> 'warnAt')::numeric, 80);
  v_large := coalesce((v_sum ->> 'largeTxn')::numeric, 0);
  v_spent := case when v_sum ->> 'month' = v_month then coalesce((v_sum ->> 'spent')::numeric, 0) else 0 end
    + (select coalesce(sum(amount), 0) from bt_inbox
       where is_debit and in_budget and not ignored and amount is not null
         and to_char(created_at at time zone 'Asia/Kolkata', 'YYYY-MM') = v_month)
    + case when p_dry_run then v_amount else 0 end;

  select coalesce((c ->> 'limit')::numeric, 0),
         case when v_sum ->> 'month' = v_month then coalesce((c ->> 'spent')::numeric, 0) else 0 end
    into v_limit, v_cat_spent
  from jsonb_array_elements(coalesce(v_sum -> 'categories', '[]'::jsonb)) c
  where c ->> 'id' = v_cat
  limit 1;
  v_limit := coalesce(v_limit, 0);
  v_cat_spent := coalesce(v_cat_spent, 0)
    + (select coalesce(sum(amount), 0) from bt_inbox
       where is_debit and not ignored and category = v_cat and amount is not null
         and to_char(created_at at time zone 'Asia/Kolkata', 'YYYY-MM') = v_month)
    + case when p_dry_run then v_amount else 0 end;

  v_bpct := case when v_budget > 0 then round(v_spent * 100 / v_budget) end;
  v_cpct := case when v_limit > 0 then round(v_cat_spent * 100 / v_limit) end;

  if v_cpct >= 100 then
    v_title := 'Over your ' || v_cat_name || ' limit';
  elsif v_bpct >= 100 then
    v_title := 'Over your monthly budget';
  elsif v_cpct >= v_warn then
    v_title := v_cat_name || ' at ' || v_cpct || '% of its limit';
  elsif v_bpct >= v_warn then
    v_title := v_bpct || '% of your monthly budget used';
  elsif v_large > 0 and v_amount >= v_large then
    v_title := 'Large payment: ' || bt_inr(v_amount);
  else
    v_title := bt_inr(v_amount) || ' spent · ' || v_cat_name;
  end if;

  v_lines := array[bt_inr(v_amount) || ' on ' || v_cat_name || '.'];
  if v_limit > 0 then
    v_lines := v_lines || (v_cat_name || ': ' || bt_inr(v_cat_spent) || ' of ' || bt_inr(v_limit) || '.');
  end if;
  if v_budget > 0 then
    v_lines := v_lines || ('This month: ' || bt_inr(v_spent) || ' of ' || bt_inr(v_budget) || ' (' || v_bpct || '%).');
  end if;

  return jsonb_build_object('ok', true, 'title', v_title, 'body', array_to_string(v_lines, ' '), 'amount', v_amount, 'category', v_cat);
end $$;

-- The app pulls captured SMS, saves them locally, then acknowledges them.
create or replace function public.bt_pull(p_secret text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform bt_require(p_secret);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', i.id,
      'body', i.body,
      'sender', i.sender,
      'received_at', to_char(i.created_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD"T"HH24:MI')
    ) order by i.id)
    from (select * from bt_inbox order by id limit 200) i
  ), '[]'::jsonb);
end $$;

create or replace function public.bt_ack(p_secret text, p_ids bigint[])
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform bt_require(p_secret);
  delete from bt_inbox where id = any(p_ids);
  get diagnostics n = row_count;
  return n;
end $$;

-- Cloud backup of the whole app state (also gives bt_capture the numbers for alerts).
create or replace function public.bt_save(p_secret text, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t timestamptz;
begin
  perform bt_require(p_secret);
  insert into bt_snapshot (id, data, updated_at) values (1, p_data, now())
  on conflict (id) do update set data = excluded.data, updated_at = now()
  returning updated_at into t;
  return jsonb_build_object('ok', true, 'updated_at', t);
end $$;

create or replace function public.bt_load(p_secret text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform bt_require(p_secret);
  return (select jsonb_build_object('data', data, 'updated_at', updated_at) from bt_snapshot where id = 1);
end $$;

create or replace function public.bt_status(p_secret text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform bt_require(p_secret);
  return jsonb_build_object(
    'ok', true,
    'pending', (select count(*) from bt_inbox),
    'snapshot_at', (select updated_at from bt_snapshot where id = 1),
    'server_time', now()
  );
end $$;

grant execute on function
  public.bt_claim(text), public.bt_capture(text, text, text, boolean), public.bt_pull(text),
  public.bt_ack(text, bigint[]), public.bt_save(text, jsonb), public.bt_load(text), public.bt_status(text)
to anon, authenticated;
