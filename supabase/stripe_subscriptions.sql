-- BookHub: Stripe課金と連携するsubscriptionsテーブル
--
-- 前提：supabase/ai_credits.sql・supabase/pricing_plans.sql を先に実行済みであること
-- （profiles.plan（'free'|'plus'|'premium'|'pro'）は、このテーブルの状態から自動で同期される。
--   AIクレジットの判定・消費（api/chat.js・api/credits.js）は、これまで通りprofiles.planを見るだけでよく、
--   書き換えの必要はない）。
--
-- 書き込みは、Stripe Webhook（api/stripe/webhook.js）からのみ行う。
-- Webhookにはログインユーザーのアクセストークンがない（Stripeサーバーからの直接呼び出しのため）ため、
-- service role key（RLSを迂回できる鍵。ブラウザには絶対に渡さない）を使って書き込む。
-- そのため、クライアント（authenticatedロール）向けのINSERT/UPDATE/DELETEポリシーはあえて用意しない。
--
-- このファイルにはgrant_plan_credits関数（決済直後にAIクレジットを即座に付与する関数。下部参照）も
-- 含まれているため、以前このファイルを実行済みでも、Webhookのクレジット付与を有効にするには
-- 再度このファイル全体を実行し直す必要がある（CREATE OR REPLACE等で書かれているため再実行は安全）。
--
-- 使い方：Supabaseの管理画面 → 「SQL Editor」→ このファイルの中身を貼り付けて実行する。

create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'plus', 'premium', 'pro')),
  status text not null default 'inactive', -- Stripeのsubscription.statusをそのまま保存する（active/canceled/past_due等）
  stripe_customer_id text,
  stripe_subscription_id text unique,
  started_at timestamptz,
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);

-- 解約予約中（期間終了時に解約する設定になっている）かどうか。Stripeのsubscription.cancel_at_period_end
-- をそのまま保存する。statusはこの間もactiveのままなのでprofiles.planは維持されるが、
-- 「解約予約中であること」自体はこの列がないと画面側で判別できないため追加する
-- （このファイルを既に実行済みの環境向けに、ADD COLUMN IF NOT EXISTSで追加する）。
alter table public.subscriptions add column if not exists cancel_at_period_end boolean not null default false;

alter table public.subscriptions enable row level security;

-- 自分の行だけ読める（現在のプラン・更新日・解約予定の表示用）
drop policy if exists "subscriptions_select_own" on public.subscriptions;
create policy "subscriptions_select_own"
  on public.subscriptions for select
  using (auth.uid() = user_id);

-- ---------- profiles.planをsubscriptionsの状態に自動で同期する ----------
--
-- statusが'active'・'trialing'のときだけ、そのplanをprofiles.planへ反映する。
-- それ以外（canceled・past_due・未契約など）は、profiles.planを'free'へ戻す
-- （＝解約・支払い失敗のときは、AIクレジット判定も即座にFree相当に戻る）。

create or replace function public.sync_profile_plan_from_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
    set plan = case when new.status in ('active', 'trialing') then new.plan else 'free' end,
        updated_at = now()
    where id = new.user_id;
  return new;
end;
$$;

drop trigger if exists on_subscription_change on public.subscriptions;
create trigger on_subscription_change
  after insert or update on public.subscriptions
  for each row execute function public.sync_profile_plan_from_subscription();

-- ---------- 決済直後にAIクレジットを即座に付与する（api/stripe/webhook.jsから呼ぶ） ----------
--
-- 上のsync_profile_plan_from_subscriptionトリガーはprofiles.planを切り替えるだけで、
-- ai_credit・credit_reset_dateには触れない。それらはsupabase/ai_credits.sqlの
-- _reset_ai_credit_if_needed（get_ai_credit_status・check_ai_credit経由）が
-- 「カレンダー上の月が変わったとき」にだけ遅延的にリセットする設計のため、
-- このままだと契約直後のユーザーは次の月の1日になるまでクレジットが0のままになってしまう。
--
-- そのため、Webhookでsubscriptionsの更新（＝profiles.planの同期）が終わった直後に、
-- この関数を明示的に呼んで、月替わりを待たずにそのプランの月間クレジットをその場で付与する。
--
-- p_monthly_credits の例： {"free": 0, "plus": 0, "premium": 1000, "pro": 3000}
-- （api/_lib/aiCredits.jsのMONTHLY_CREDITSをそのまま渡す。値をこのSQLに書き写さないため）。
-- 対象ユーザーのprofiles行が万一まだ無ければ、その場で作ってから付与する。

create or replace function public.grant_plan_credits(
  p_user_id uuid,
  p_monthly_credits jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan text;
  v_monthly integer;
begin
  select plan into v_plan from public.profiles where id = p_user_id;

  if not found then
    v_plan := 'free';
    insert into public.profiles (id, plan)
    values (p_user_id, v_plan)
    on conflict (id) do nothing;
  end if;

  v_monthly := coalesce((p_monthly_credits ->> v_plan)::integer, 0);

  update public.profiles
    set ai_credit = v_monthly,
        credit_reset_date = date_trunc('month', now())::date,
        updated_at = now()
    where id = p_user_id;

  return jsonb_build_object('ok', true, 'plan', v_plan, 'granted', v_monthly);
end;
$$;

-- Webhook（service role key経由）からのみ呼ぶ。ログインユーザーの操作からは呼べないようにする
-- （＝authenticatedロールには渡さず、service_roleにだけ実行権限を与える）
grant execute on function public.grant_plan_credits(uuid, jsonb) to service_role;
