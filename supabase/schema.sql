-- ============================================================
-- PromptCanvas AI - Supabase schema
-- Run this ONCE in Supabase Dashboard > SQL Editor > New query.
-- Paste everything and click RUN.
-- ============================================================

-- 1. Profiles: one row per user (auto-created on signup)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  credits int not null default 2,
  plan text not null default 'free',            -- 'free' | 'premium'
  premium_until timestamptz,
  next_renewal timestamptz,
  last_daily_reset date,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- 2. Editing history
create table if not exists public.edits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  prompt text,
  input_path text,
  output_path text,
  status text not null default 'done',          -- 'pending' | 'done' | 'failed'
  credits_spent int not null default 1,
  provider text,
  created_at timestamptz not null default now()
);
create index if not exists edits_user_idx on public.edits (user_id, created_at desc);

-- 3. Payment transactions (server-side only; clients can read their own)
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,                       -- 'paystack' | 'flutterwave'
  reference text not null unique,
  plan text not null,                           -- 'monthly' | 'yearly'
  amount int not null,                          -- in kobo (NGN minor units)
  currency text not null default 'NGN',
  status text not null default 'pending',       -- 'pending' | 'success' | 'failed'
  provider_data jsonb,
  created_at timestamptz not null default now()
);
create index if not exists tx_user_idx on public.transactions (user_id, created_at desc);

-- 4. Ad placement config (managed from the admin dashboard)
create table if not exists public.ads_config (
  id int primary key default 1,
  banners jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
insert into public.ads_config (id, banners)
values (1, '{"banner": "", "native": "", "socialbar": "", "popunder": ""}'::jsonb)
on conflict (id) do nothing;

-- 5. Auto-create a profile whenever someone signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- 6. Atomic credit claim (prevents limit bypass: all checks inside the database)
create or replace function public.claim_credit(p_uid uuid, p_cost int)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  today date := (now() at time zone 'utc')::date;
begin
  select * into p from public.profiles where id = p_uid for update;
  if not found then return false; end if;
  if p.plan = 'premium' and p.premium_until > now() then
    if p.credits < p_cost then return false; end if;
  else
    -- free plan: 2 credits that reset every day (UTC day)
    if p.last_daily_reset is null or p.last_daily_reset < today then
      p.credits := 2;
      p.last_daily_reset := today;
    end if;
    if p.credits < p_cost then return false; end if;
  end if;
  update public.profiles
  set credits = p.credits - p_cost, last_daily_reset = p.last_daily_reset
  where id = p_uid;
  return true;
end $$;

-- 7. Refund a credit when AI processing fails
create or replace function public.refund_credit(p_uid uuid, p_cost int)
returns void language sql security definer set search_path = public as $$
  update public.profiles set credits = credits + p_cost where id = p_uid;
$$;

-- 8. Monthly credit renewal for active subscriptions (called by the daily cron)
create or replace function public.renew_subscriptions()
returns int language plpgsql security definer set search_path = public as $$
declare
  n int := 0;
  r record;
begin
  -- downgrade expired subscriptions
  update public.profiles
  set plan = 'free', premium_until = null, next_renewal = null
  where plan = 'premium' and premium_until is not null and premium_until <= now();
  -- grant this month's 100 credits where a renewal is due
  for r in
    select id, next_renewal from public.profiles
    where plan = 'premium' and premium_until > now()
      and next_renewal is not null and next_renewal <= now()
  loop
    update public.profiles
    set credits = 100,
        next_renewal = next_renewal + interval '1 month'
    where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- 9. Row Level Security: users can only see their own data
alter table public.profiles enable row level security;
alter table public.edits enable row level security;
alter table public.transactions enable row level security;
alter table public.ads_config enable row level security;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
for select using (auth.uid() = id);

drop policy if exists "own edits" on public.edits;
create policy "own edits" on public.edits
for select using (auth.uid() = user_id);

drop policy if exists "own transactions" on public.transactions;
create policy "own transactions" on public.transactions
for select using (auth.uid() = user_id);

drop policy if exists "read ads" on public.ads_config;
create policy "read ads" on public.ads_config
for select using (true);
