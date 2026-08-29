-- BookHub: 実践（actions）テーブル
--
-- 使い方：Supabaseの管理画面 → 「SQL Editor」→ このファイルの中身を貼り付けて実行する。
-- books.sqlを先に実行しておく必要がある（book_idがbooks(id)を参照するため）。
-- 「実績」は独立テーブルにせず、statusが'cleared'になった行として表現する。

create table if not exists public.actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  book_id uuid references public.books(id) on delete set null,
  content text not null,
  purpose text,
  start_date date,
  due_date date,
  status text not null default 'not-started' check (status in ('not-started', 'in-progress', 'done', 'cleared')),
  todos jsonb not null default '[]',
  reflection text,
  cleared_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.actions enable row level security;

-- ログインユーザー本人の行だけ読める
drop policy if exists "actions_select_own" on public.actions;
create policy "actions_select_own"
  on public.actions for select
  using (auth.uid() = user_id);

-- ログインユーザー本人の行だけ新規作成できる（user_idを自分以外にして作ることはできない）
drop policy if exists "actions_insert_own" on public.actions;
create policy "actions_insert_own"
  on public.actions for insert
  with check (auth.uid() = user_id);

-- ログインユーザー本人の行だけ更新できる
drop policy if exists "actions_update_own" on public.actions;
create policy "actions_update_own"
  on public.actions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ログインユーザー本人の行だけ削除できる
drop policy if exists "actions_delete_own" on public.actions;
create policy "actions_delete_own"
  on public.actions for delete
  using (auth.uid() = user_id);
