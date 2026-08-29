-- BookHub: 本棚（books）テーブル
--
-- 使い方：Supabaseの管理画面 → 「SQL Editor」→ このファイルの中身を貼り付けて実行する。
-- 他のテーブル（schema.sql・ai_credits.sql・pricing_plans.sql）とは独立しており、
-- どの順番で実行しても問題ない。

create table if not exists public.books (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('practical', 'novel')),
  title text not null,
  author text,
  cover_image_url text,
  page_count integer,
  page_adjustment integer not null default 0,
  publisher text,
  published_date text,
  isbn text,
  want_to_read boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.books enable row level security;

-- ログインユーザー本人の行だけ読める
drop policy if exists "books_select_own" on public.books;
create policy "books_select_own"
  on public.books for select
  using (auth.uid() = user_id);

-- ログインユーザー本人の行だけ新規作成できる（user_idを自分以外にして作ることはできない）
drop policy if exists "books_insert_own" on public.books;
create policy "books_insert_own"
  on public.books for insert
  with check (auth.uid() = user_id);

-- ログインユーザー本人の行だけ更新できる
drop policy if exists "books_update_own" on public.books;
create policy "books_update_own"
  on public.books for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ログインユーザー本人の行だけ削除できる
drop policy if exists "books_delete_own" on public.books;
create policy "books_delete_own"
  on public.books for delete
  using (auth.uid() = user_id);
