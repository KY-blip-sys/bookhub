-- BookHub: 好きな言葉（favorite_quotes）テーブル
--
-- 使い方：Supabaseの管理画面 → 「SQL Editor」→ このファイルの中身を貼り付けて実行する。
-- books.sqlを先に実行しておく必要がある（book_idがbooks(id)を参照するため）。

create table if not exists public.favorite_quotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  book_id uuid references public.books(id) on delete cascade,
  category text not null check (category in ('practical', 'novel')),
  text text not null,
  created_at timestamptz not null default now()
);

alter table public.favorite_quotes enable row level security;

-- ログインユーザー本人の行だけ読める
drop policy if exists "favorite_quotes_select_own" on public.favorite_quotes;
create policy "favorite_quotes_select_own"
  on public.favorite_quotes for select
  using (auth.uid() = user_id);

-- ログインユーザー本人の行だけ新規作成できる（user_idを自分以外にして作ることはできない）
drop policy if exists "favorite_quotes_insert_own" on public.favorite_quotes;
create policy "favorite_quotes_insert_own"
  on public.favorite_quotes for insert
  with check (auth.uid() = user_id);

-- ログインユーザー本人の行だけ更新できる
drop policy if exists "favorite_quotes_update_own" on public.favorite_quotes;
create policy "favorite_quotes_update_own"
  on public.favorite_quotes for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ログインユーザー本人の行だけ削除できる
drop policy if exists "favorite_quotes_delete_own" on public.favorite_quotes;
create policy "favorite_quotes_delete_own"
  on public.favorite_quotes for delete
  using (auth.uid() = user_id);
