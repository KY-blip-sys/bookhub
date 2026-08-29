// BookHub: Supabaseへservice role key（RLSを迂回できる鍵）で接続するための共通処理。
//
// api/_lib/supabaseUser.jsは「ログインユーザー本人としてRLSの下で」Supabaseを呼ぶが、
// Stripe Webhook（api/stripe/webhook.js）にはログインユーザーのアクセストークンがない
// （Stripeサーバーからの直接呼び出しのため）。そのため、ここだけはservice role keyを使い、
// 「Webhookが受け取ったStripeの顧客・サブスクリプションIDから、対応するユーザーの行を直接更新する」
// ことを許可する。
//
// service role keyは絶対にブラウザへ渡さない・このファイル以外（Webhook処理）では使わない。
//
// ファイル名がアンダースコアで始まるディレクトリ（api/_lib）に置いているため、
// Vercelはこのファイルを独立したAPIエンドポイントとして扱わない。

const { createClient } = require("@supabase/supabase-js");

let client = null;

function getSupabaseAdmin() {
  if (!client) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error(
        "Supabaseの環境変数（SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY）が設定されていません。"
      );
    }
    client = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }
  return client;
}

module.exports = { getSupabaseAdmin };
