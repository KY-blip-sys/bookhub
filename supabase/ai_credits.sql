-- BookHub: AIクレジット制のためのテーブル・関数
--
-- 「無料・プレミアムともにAIクレジットを消費してAI機能を使う」仕組みを、
-- すべてSupabase側（Postgres）で管理する。ブラウザ側やVercel Functionは
-- 「関数を呼ぶだけ」で、残高の確認・月替わりリセット・消費はここに閉じ込める。
--
-- 消費クレジット・プランごとの付与クレジットの「値」自体は、
-- api/_lib/aiCredits.js（Node側）に定数としてまとめてあり、関数を呼ぶときに
-- 引数として渡す（SQL側とJS側で数値を二重管理しないようにするため）。
--
-- 使い方：Supabaseの管理画面 → 「SQL Editor」→ このファイルの中身を貼り付けて実行する。
-- supabase/schema.sql（app_dataテーブル）とは独立しており、どちらを先に実行しても問題ない。

-- ---------- profiles：ユーザーごとのプラン・AIクレジット残高 ----------

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'premium')),
  ai_credit integer not null default 100,
  credit_reset_date date not null default date_trunc('month', now())::date,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- 自分の行だけ読める（残高・プランの表示用）。
-- ai_credit・credit_reset_date・planへの書き込みは、下のSECURITY DEFINER関数からのみ行い、
-- クライアントから直接UPDATEできないよう、update用のポリシーはあえて用意しない
-- （＝クレジット判定・消費を必ずサーバー側の処理にする、という実装方針をDBレベルでも保証する）。
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

-- 新規登録（auth.usersへのINSERT）のたびに、自動でprofilesの行を1つ作る
-- （plan=free、ai_credit=100、credit_reset_date=当月）
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, plan, ai_credit, credit_reset_date)
  values (new.id, 'free', 100, date_trunc('month', now())::date)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 既にログイン済みのユーザー（このSQLを後から実行する場合）にも、profilesの行を作っておく
insert into public.profiles (id, plan, ai_credit, credit_reset_date)
select u.id, 'free', 100, date_trunc('month', now())::date
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;

-- ---------- 月替わりリセット＋クレジット判定・消費（すべてSECURITY DEFINERで実行） ----------
--
-- p_free_monthly / p_premium_monthly は、プランごとに毎月付与するクレジット数
-- （api/_lib/aiCredits.jsのMONTHLY_CREDITSをそのまま渡す）。
-- p_cost は、呼び出されたAI機能が消費するクレジット数
-- （api/_lib/aiCredits.jsのFEATURE_COSTSから、機能名に応じて渡す）。

-- 内部共通処理：月が変わっていればプランに応じた上限までリセットしてから、
-- 現在のplan・残高・上限を返す（プロフィール行が無ければこの場で作る）
create or replace function public._reset_ai_credit_if_needed(
  p_user_id uuid,
  p_free_monthly integer,
  p_premium_monthly integer
)
returns table(plan text, ai_credit integer, monthly_limit integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan text;
  v_credit integer;
  v_reset_date date;
  v_monthly integer;
  v_current_month date := date_trunc('month', now())::date;
begin
  select p.plan, p.ai_credit, p.credit_reset_date
    into v_plan, v_credit, v_reset_date
  from public.profiles p
  where p.id = p_user_id
  for update;

  if not found then
    insert into public.profiles (id, plan, ai_credit, credit_reset_date)
    values (p_user_id, 'free', p_free_monthly, v_current_month)
    returning profiles.plan, profiles.ai_credit, profiles.credit_reset_date
      into v_plan, v_credit, v_reset_date;
  end if;

  v_monthly := case when v_plan = 'premium' then p_premium_monthly else p_free_monthly end;

  if v_reset_date < v_current_month then
    v_credit := v_monthly;
    update public.profiles
      set ai_credit = v_credit, credit_reset_date = v_current_month, updated_at = now()
      where id = p_user_id;
  end if;

  return query select v_plan, v_credit, v_monthly;
end;
$$;

-- フロント表示用：残高・プラン・上限を返すだけ（消費はしない）。月替わりリセットの反映のためだけに呼ぶ
create or replace function public.get_ai_credit_status(
  p_free_monthly integer,
  p_premium_monthly integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  r record;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select * into r from public._reset_ai_credit_if_needed(v_user_id, p_free_monthly, p_premium_monthly);

  return jsonb_build_object(
    'ok', true,
    'plan', r.plan,
    'remaining', r.ai_credit,
    'monthlyLimit', r.monthly_limit
  );
end;
$$;

-- AI機能を呼ぶ「前」に使う：月替わりリセットをした上で、残高がp_cost以上あるか判定する（消費はしない）
create or replace function public.check_ai_credit(
  p_cost integer,
  p_free_monthly integer,
  p_premium_monthly integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  r record;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select * into r from public._reset_ai_credit_if_needed(v_user_id, p_free_monthly, p_premium_monthly);

  if r.ai_credit < p_cost then
    return jsonb_build_object(
      'ok', false,
      'error', 'insufficient_credit',
      'plan', r.plan,
      'remaining', r.ai_credit,
      'monthlyLimit', r.monthly_limit
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'plan', r.plan,
    'remaining', r.ai_credit,
    'monthlyLimit', r.monthly_limit
  );
end;
$$;

-- AI機能の実行に「成功した後」に使う：p_costぶんだけ残高を減らす
create or replace function public.deduct_ai_credit(p_cost integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_credit integer;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  update public.profiles
    set ai_credit = greatest(ai_credit - p_cost, 0), updated_at = now()
    where id = v_user_id
    returning ai_credit into v_credit;

  return jsonb_build_object('ok', true, 'remaining', v_credit);
end;
$$;

-- ログイン済みユーザー（authenticatedロール）だけがこれらの関数を呼べるようにする
grant execute on function public.get_ai_credit_status(integer, integer) to authenticated;
grant execute on function public.check_ai_credit(integer, integer, integer) to authenticated;
grant execute on function public.deduct_ai_credit(integer) to authenticated;
