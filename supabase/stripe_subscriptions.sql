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
