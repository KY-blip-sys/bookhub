-- BookHub: 開発者モード（profiles.is_developer）
--
-- profiles.is_developer が true のユーザーは、プラン（free/plus/premium/pro）や
-- Stripeの契約状況に一切関係なく、AIクレジットを消費せずにすべてのAI機能を利用できるようにする。
--
-- is_developerはアプリのどの画面・APIからも書き換えられない（クライアント用のUPDATEポリシーは
-- 用意しない）。開発者フラグを立てたいユーザーには、Supabaseの管理画面 → 「Table Editor」→
-- profilesテーブルから直接 is_developer を true にするか、SQL Editorで
--   update public.profiles set is_developer = true where id = '対象ユーザーのUUID';
-- を実行する運用とする。
--
-- 前提：supabase/ai_credits.sql（_reset_ai_credit_if_needed・get_ai_credit_status・
-- check_ai_credit・deduct_ai_credit）を先に実行済みであること。このファイルはそのうち3関数
-- （_reset_ai_credit_if_neededは除く）を、開発者判定つきで置き換える。
--
-- 使い方：Supabaseの管理画面 → 「SQL Editor」→ このファイルの中身を貼り付けて実行する。

-- ---------- profiles.is_developer 列を追加する ----------

alter table public.profiles add column if not exists is_developer boolean not null default false;

-- ---------- get_ai_credit_status：開発者は常にAI利用可・無制限として返す ----------
--
-- jsonbはInfinityを表現できないため、「無制限」を表す固定値として999999999を使う
-- （UIはremaining/monthlyLimitをそのまま表示するだけなので、この値でも問題なく表示できる）。
-- planは実際のprofiles.planではなく'developer'を返す（js/screens/aiCredits.jsのPLAN_DISPLAY_LABELS・
-- api/_lib/aiCredits.jsのgetPlanAdsが'developer'を認識し、Premium/Pro同様「広告なし」として扱う）。

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
  v_is_developer boolean;
  r record;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select coalesce(p.is_developer, false) into v_is_developer
  from public.profiles p
  where p.id = v_user_id;

  if v_is_developer then
    return jsonb_build_object(
      'ok', true,
      'plan', 'developer',
      'remaining', 999999999,
      'monthlyLimit', 999999999,
      'aiEnabled', true,
      'isDeveloper', true
    );
  end if;

  select * into r from public._reset_ai_credit_if_needed(v_user_id, p_monthly_credits);

  return jsonb_build_object(
    'ok', true,
    'plan', r.plan,
    'remaining', r.ai_credit,
    'monthlyLimit', r.monthly_limit,
    'aiEnabled', p_ai_enabled_plans @> to_jsonb(r.plan),
    'isDeveloper', false
  );
end;
$$;

-- ---------- check_ai_credit：開発者はプラン判定・残高判定の両方をスキップする ----------
--
-- 月替わりリセット（_reset_ai_credit_if_needed）すら呼ばずに即okを返す。
-- これにより、開発者のprofiles.plan・ai_creditが実際どんな値でも（Stripe未契約でFree/0のままでも）
-- AI機能を利用できる。

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
  v_is_developer boolean;
  r record;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select coalesce(p.is_developer, false) into v_is_developer
  from public.profiles p
  where p.id = v_user_id;

  if v_is_developer then
    return jsonb_build_object(
      'ok', true,
      'plan', 'developer',
      'remaining', 999999999,
      'monthlyLimit', 999999999,
      'aiEnabled', true,
      'isDeveloper', true
    );
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

-- ---------- deduct_ai_credit：開発者は残高を一切減らさない ----------

create or replace function public.deduct_ai_credit(p_cost integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_is_developer boolean;
  v_credit integer;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select coalesce(is_developer, false) into v_is_developer
  from public.profiles
  where id = v_user_id;

  if v_is_developer then
    return jsonb_build_object('ok', true, 'remaining', 999999999);
  end if;

  update public.profiles
    set ai_credit = greatest(ai_credit - p_cost, 0), updated_at = now()
    where id = v_user_id
    returning ai_credit into v_credit;

  return jsonb_build_object('ok', true, 'remaining', v_credit);
end;
$$;

-- ---------- ログイン済みユーザー（authenticatedロール）だけが呼べるようにする ----------
-- （3関数ともシグネチャは変わっていないため、ai_credits.sqlでのgrantのままでよいが、
-- 　このファイル単体で実行しても安全なように明示しておく）

grant execute on function public.get_ai_credit_status(jsonb, jsonb) to authenticated;
grant execute on function public.check_ai_credit(integer, jsonb, jsonb) to authenticated;
grant execute on function public.deduct_ai_credit(integer) to authenticated;
