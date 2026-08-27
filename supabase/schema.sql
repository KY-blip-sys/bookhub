-- BookHub: ユーザーごとのデータを保存するテーブル
--
-- 既存のBookHubはlocalStorageに次の9種類のデータをJSONとして保存している：
--   reading-app-books, reading-app-actions, reading-app-achievements,
--   reading-app-reviews, reading-app-favorite-quotes, reading-app-favorite-learnings,
--   reading-app-active-category, reading-app-dark-mode, reading-app-daily-goal-minutes
--
-- この構造をそのまま活かすため、1種類ずつ専用のテーブルを作るのではなく、
-- 「キー（データの種類）＋その中身（JSON）」を1行として保存する汎用テーブルにしている。
-- こうすると、既存のlocalStorageの保存の仕組み（js/models/storage.js）を大きく作り直さずに
-- そのままクラウド保存へつなげられる。
--
-- 使い方：Supabaseの管理画面 → 「SQL Editor」→ このファイルの中身を貼り付けて実行する。

create table if not exists public.app_data (
  user_id uuid not null references auth.users(id) on delete cascade,
  data_key text not null,
  data_value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, data_key)
);

-- 行単位のセキュリティ（RLS）を有効にする。
-- これを有効にしないと、デフォルトでは他人の行も読み書きできてしまう。
alter table public.app_data enable row level security;

-- 自分（ログイン中のユーザー）の行だけ読める
create policy "app_data_select_own"
  on public.app_data for select
  using (auth.uid() = user_id);

-- 自分の行だけ新規作成できる（user_idを自分以外にして作ることはできない）
create policy "app_data_insert_own"
  on public.app_data for insert
  with check (auth.uid() = user_id);

-- 自分の行だけ更新できる
create policy "app_data_update_own"
  on public.app_data for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 自分の行だけ削除できる
create policy "app_data_delete_own"
  on public.app_data for delete
  using (auth.uid() = user_id);
