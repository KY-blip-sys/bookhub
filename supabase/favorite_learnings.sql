-- BookHub: 学んだこと（favorite_learnings）テーブル
--
-- 使い方：Supabaseの管理画面 → 「SQL Editor」→ このファイルの中身を貼り付けて実行する。
-- books.sqlを先に実行しておく必要がある（book_idがbooks(id)を参照するため）。

create table if not exists public.favorite_learnings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now()
);

alter table public.favorite_learnings enable row level security;

-- ログインユーザー本人の行だけ読める
drop policy if exists "favorite_learnings_select_own" on public.favorite_learnings;
create policy "favorite_learnings_select_own"
  on public.favorite_learnings for select
  using (auth.uid() = user_id);

-- ログインユーザー本人の行だけ新規作成できる（user_idを自分以外にして作ることはできない）
drop policy if exists "favorite_learnings_insert_own" on public.favorite_learnings;
create policy "favorite_learnings_insert_own"
  on public.favorite_learnings for insert
  with check (auth.uid() = user_id);

-- ログインユーザー本人の行だけ更新できる
drop policy if exists "favorite_learnings_update_own" on public.favorite_learnings;
create policy "favorite_learnings_update_own"
  on public.favorite_learnings for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ログインユーザー本人の行だけ削除できる
drop policy if exists "favorite_learnings_delete_own" on public.favorite_learnings;
create policy "favorite_learnings_delete_own"
  on public.favorite_learnings for delete
  using (auth.uid() = user_id);
