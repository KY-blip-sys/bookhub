-- BookHub: 読書記録（book_records）テーブル
--
-- 使い方：Supabaseの管理画面 → 「SQL Editor」→ このファイルの中身を貼り付けて実行する。
-- books.sqlを先に実行しておく必要がある（book_idがbooks(id)を参照するため）。

create table if not exists public.book_records (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  recorded_date date not null,
  recorded_at timestamptz not null default now(),
  minutes integer not null,
  pages integer not null default 0,
  -- 小説の記録用（実用書の記録ではnull）
  impression text,
  memorable_quote text,
  favorite_character text,
  notes text,
  -- 実用書の記録用（小説の記録ではnull）
  learning text,
  quote text
);

alter table public.book_records enable row level security;

-- ログインユーザー本人の行だけ読める
drop policy if exists "book_records_select_own" on public.book_records;
create policy "book_records_select_own"
  on public.book_records for select
  using (auth.uid() = user_id);

-- ログインユーザー本人の行だけ新規作成できる（user_idを自分以外にして作ることはできない）
drop policy if exists "book_records_insert_own" on public.book_records;
create policy "book_records_insert_own"
  on public.book_records for insert
  with check (auth.uid() = user_id);

-- ログインユーザー本人の行だけ更新できる
drop policy if exists "book_records_update_own" on public.book_records;
create policy "book_records_update_own"
  on public.book_records for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ログインユーザー本人の行だけ削除できる
drop policy if exists "book_records_delete_own" on public.book_records;
create policy "book_records_delete_own"
  on public.book_records for delete
  using (auth.uid() = user_id);
