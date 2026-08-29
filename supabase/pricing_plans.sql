-- BookHub: 料金プラン（Free / Plus / AI Premium / AI Pro）対応の追加SQL
--
-- 前提：supabase/ai_credits.sql を先に実行済みであること
-- （このファイルは、そこで作ったprofilesテーブル・トリガー・deduct_ai_credit関数はそのまま使い、
--   プラン判定に関わる3つの関数だけを新しい設計（プラン数が増えても対応できる形）に置き換える）。
--
-- 変更点：
-- ・plan列に'plus'・'pro'を追加できるようにする（これまでは'free'・'premium'のみ）
-- ・月間付与クレジット・AI利用可否のプランごとの判定を、固定の2引数（free/premium）ではなく、
--   Node側（api/_lib/aiCredits.jsのPLAN_CATALOG）から渡すjsonbのマップ／配列で行うようにする
--   → 将来プランが増えても、このSQLを書き換える必要がなくなる
--
-- 使い方：Supabaseの管理画面 → 「SQL Editor」→ このファイルの中身を貼り付けて実行する。

-- ---------- profiles.plan：新しいプラン名を許可する ----------

alter table public.profiles drop constraint if exists profiles_plan_check;
alter table public.profiles
  add constraint profiles_plan_check check (plan in ('free', 'plus', 'premium', 'pro'));

-- ---------- 古い（プラン2種類固定の）関数を削除する ----------

drop function if exists public.get_ai_credit_status(integer, integer);
drop function if exists public.check_ai_credit(integer, integer, integer);
drop function if exists public._reset_ai_credit_if_needed(uuid, integer, integer);

-- ---------- 内部共通処理（月替わりリセット）：プランごとの付与量をjsonbのマップで受け取る ----------
--
-- p_monthly_credits の例： {"free": 0, "plus": 0, "premium": 1000, "pro": 3000}
-- （api/_lib/aiCredits.jsのMONTHLY_CREDITSをそのまま渡す）

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
  v_free_monthly integer := coalesce((p_monthly_credits ->> 'free')::integer, 0);
begin
  select p.plan, p.ai_credit, p.credit_reset_date
    into v_plan, v_credit, v_reset_date
  from public.profiles p
  where p.id = p_user_id
  for update;

  if not found then
    insert into public.profiles (id, plan, ai_credit, credit_reset_date)
    values (p_user_id, 'free', v_free_monthly, v_current_month)
    returning profiles.plan, profiles.ai_credit, profiles.credit_reset_date
      into v_plan, v_credit, v_reset_date;
  end if;

  v_monthly := coalesce((p_monthly_credits ->> v_plan)::integer, 0);

  if v_reset_date < v_current_month then
    v_credit := v_monthly;
    update public.profiles
      set ai_credit = v_credit, credit_reset_date = v_current_month, updated_at = now()
      where id = p_user_id;
  end if;

  return query select v_plan, v_credit, v_monthly;
end;
$$;

-- ---------- フロント表示用：残高・プラン・上限・AI利用可否を返す（消費はしない） ----------
--
-- p_ai_enabled_plans の例： ["premium", "pro"]（api/_lib/aiCredits.jsのAI_ENABLED_PLANSをそのまま渡す）

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
  v_ai_enabled boolean;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select * into r from public._reset_ai_credit_if_needed(v_user_id, p_monthly_credits);
  v_ai_enabled := p_ai_enabled_plans ? r.plan;

  return jsonb_build_object(
    'ok', true,
    'plan', r.plan,
    'remaining', r.ai_credit,
    'monthlyLimit', r.monthly_limit,
    'aiEnabled', v_ai_enabled
  );
end;
$$;

-- ---------- AI機能を呼ぶ「前」に使う：プランのAI利用可否 → 残高判定の順にチェックする（消費はしない） ----------

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
  v_ai_enabled boolean;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select * into r from public._reset_ai_credit_if_needed(v_user_id, p_monthly_credits);
  v_ai_enabled := p_ai_enabled_plans ? r.plan;

  if not v_ai_enabled then
    -- Free・PlusプランなどAIが使えないプランの場合：残高を見るまでもなくここで終わる
    return jsonb_build_object(
      'ok', false,
      'error', 'plan_not_eligible',
      'plan', r.plan,
      'remaining', r.ai_credit,
      'monthlyLimit', r.monthly_limit,
      'aiEnabled', false
    );
  end if;

  if r.ai_credit < p_cost then
    return jsonb_build_object(
      'ok', false,
      'error', 'insufficient_credit',
      'plan', r.plan,
      'remaining', r.ai_credit,
      'monthlyLimit', r.monthly_limit,
      'aiEnabled', true
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'plan', r.plan,
    'remaining', r.ai_credit,
    'monthlyLimit', r.monthly_limit,
    'aiEnabled', true
  );
end;
$$;

-- ---------- ログイン済みユーザー（authenticatedロール）だけが呼べるようにする ----------
-- （deduct_ai_credit(integer)は signature が変わっていないため、ai_credits.sqlでのgrantのままでよい）

grant execute on function public.get_ai_credit_status(jsonb, jsonb) to authenticated;
grant execute on function public.check_ai_credit(integer, jsonb, jsonb) to authenticated;
