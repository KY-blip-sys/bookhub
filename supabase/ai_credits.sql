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
  id uuid primary key references auth.users(id) on delete cascade
);

-- profilesテーブルが（display_name・avatar_urlだけを持つなど）別の経緯で先に作られていた場合でも
-- 必要な列がそろうよう、1列ずつ ADD COLUMN IF NOT EXISTS で追加する
-- （CREATE TABLE IF NOT EXISTSは、テーブルが既に存在すると列定義ごと無視されてしまうため、
-- 　このファイルで必要な列は必ずここで個別に追加する）
alter table public.profiles add column if not exists plan text not null default 'free' check (plan in ('free', 'premium'));
alter table public.profiles add column if not exists ai_credit integer not null default 100;
alter table public.profiles add column if not exists credit_reset_date date not null default date_trunc('month', now())::date;
alter table public.profiles add column if not exists updated_at timestamptz not null default now();
alter table public.profiles add column if not exists display_name text;
alter table public.profiles add column if not exists avatar_url text;

-- plan列の初回追加時はplanが'free'/'premium'の2値しか想定していなかったが、
-- 現在はapi/_lib/aiCredits.jsのPLAN_CATALOG・supabase/stripe_subscriptions.sqlに合わせて
-- 'free'|'plus'|'premium'|'pro'の4プラン運用になっている。既存の制約が残ったままだと
-- サブスク同期トリガー（sync_profile_plan_from_subscription）がplan='plus'/'pro'を
-- 書き込もうとした瞬間に制約違反で失敗するため、ここで許可する値を4プランに広げ直す
-- （このSQLを再実行しても安全なように、まず既存の制約名を決め打ちせずdrop constraintする）。
alter table public.profiles drop constraint if exists profiles_plan_check;
alter table public.profiles add constraint profiles_plan_check check (plan in ('free', 'plus', 'premium', 'pro'));

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
-- display_name・avatar_urlは、signUp時にoptions.dataで渡されたユーザーメタデータ
-- （new.raw_user_meta_data）から取る。display_nameが渡されていなければ、
-- メールアドレスの@より前の部分を仮の表示名として使う
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, plan, ai_credit, credit_reset_date, display_name, avatar_url)
  values (
    new.id,
    'free',
    100,
    date_trunc('month', now())::date,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 既にログイン済みのユーザー（このSQLを後から実行する場合）にも、profilesの行を作っておく
insert into public.profiles (id, plan, ai_credit, credit_reset_date, display_name, avatar_url)
select
  u.id,
  'free',
  100,
  date_trunc('month', now())::date,
  coalesce(u.raw_user_meta_data->>'display_name', split_part(u.email, '@', 1)),
  u.raw_user_meta_data->>'avatar_url'
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;

-- display_nameカラムを今回追加したことで既存行はnullのままなので、
-- メールアドレスの@より前の部分で埋めておく（このSQLを再実行しても安全）
update public.profiles p
set display_name = coalesce(p.display_name, split_part(u.email, '@', 1))
from auth.users u
where u.id = p.id and p.display_name is null;

-- ---------- 月替わりリセット＋クレジット判定・消費（すべてSECURITY DEFINERで実行） ----------
--
-- p_monthly_credits は、プランキー（'free'|'plus'|'premium'|'pro'）→月間クレジット数のjsonbオブジェクト
-- （api/_lib/aiCredits.jsのMONTHLY_CREDITSをそのまま渡す）。
-- p_ai_enabled_plans は、AI機能を利用できるプランキーのjsonb配列
-- （api/_lib/aiCredits.jsのAI_ENABLED_PLANSをそのまま渡す）。
-- p_cost は、呼び出されたAI機能が消費するクレジット数
-- （api/_lib/aiCredits.jsのFEATURE_COSTSから、機能名に応じて渡す）。
--
-- 以前はplanが'free'/'premium'の2値・p_free_monthly/p_premium_monthly整数2つという前提だったが、
-- api/_lib/aiCredits.jsが'free'|'plus'|'premium'|'pro'の4プラン・p_monthly_credits/p_ai_enabled_plans
-- （jsonb）というシグネチャに変わったため、SQL側もそれに合わせて全面的に置き換える。
-- 引数の型・個数が変わるとcreate or replaceは別関数として追加されてしまいPostgREST側で
-- 複数候補エラーになるため、まず古いシグネチャの関数を明示的にdropする。
drop function if exists public._reset_ai_credit_if_needed(uuid, integer, integer);
drop function if exists public.get_ai_credit_status(integer, integer);
drop function if exists public.check_ai_credit(integer, integer, integer);

-- 内部共通処理：月が変わっていればプランに応じた上限までリセットしてから、
-- 現在のplan・残高・上限を返す（プロフィール行が無ければこの場で作る）
create or replace function public._reset_ai_credit_if_needed(
  p_user_id uuid,
  p_monthly_credits jsonb
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
    v_monthly := coalesce((p_monthly_credits->>'free')::integer, 0);
    insert into public.profiles (id, plan, ai_credit, credit_reset_date)
    values (p_user_id, 'free', v_monthly, v_current_month)
    returning profiles.plan, profiles.ai_credit, profiles.credit_reset_date
      into v_plan, v_credit, v_reset_date;
  end if;

  v_monthly := coalesce((p_monthly_credits->>v_plan)::integer, 0);

  if v_reset_date < v_current_month then
    v_credit := v_monthly;
    update public.profiles
      set ai_credit = v_credit, credit_reset_date = v_current_month, updated_at = now()
      where id = p_user_id;
  end if;

  return query select v_plan, v_credit, v_monthly;
end;
$$;

-- フロント表示用：残高・プラン・上限・AI利用可否を返すだけ（消費はしない）。月替わりリセットの反映のためだけに呼ぶ
create or replace function public.get_ai_credit_status(
  p_monthly_credits jsonb,
  p_ai_enabled_plans jsonb
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

  select * into r from public._reset_ai_credit_if_needed(v_user_id, p_monthly_credits);

  return jsonb_build_object(
    'ok', true,
    'plan', r.plan,
    'remaining', r.ai_credit,
    'monthlyLimit', r.monthly_limit,
    'aiEnabled', p_ai_enabled_plans @> to_jsonb(r.plan)
  );
end;
$$;

-- AI機能を呼ぶ「前」に使う：月替わりリセット・プランのAI利用可否・残高がp_cost以上あるかを判定する（消費はしない）
create or replace function public.check_ai_credit(
  p_cost integer,
  p_monthly_credits jsonb,
  p_ai_enabled_plans jsonb
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

  select * into r from public._reset_ai_credit_if_needed(v_user_id, p_monthly_credits);

  if not (p_ai_enabled_plans @> to_jsonb(r.plan)) then
    return jsonb_build_object(
      'ok', false,
      'error', 'plan_not_eligible',
      'plan', r.plan,
      'remaining', r.ai_credit,
      'monthlyLimit', r.monthly_limit
    );
  end if;

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
grant execute on function public.get_ai_credit_status(jsonb, jsonb) to authenticated;
grant execute on function public.check_ai_credit(integer, jsonb, jsonb) to authenticated;
grant execute on function public.deduct_ai_credit(integer) to authenticated;
