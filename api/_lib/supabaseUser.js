// BookHub: リクエストのAuthorizationヘッダー（Supabaseのアクセストークン）から
// 「誰がログインしているか」を確認するための共通処理。
//
// AIクレジットの判定・消費はSupabase側のSECURITY DEFINER関数（supabase/ai_credits.sql）で行うが、
// 「本人としてRLSの下で関数を呼ぶ」ために、ユーザーのアクセストークンをAuthorizationヘッダーとして
// 持ったSupabaseクライアントを作って返す（service_role keyは一切使わない）。
//
// ファイル名がアンダースコアで始まるディレクトリ（api/_lib）に置いているため、
// Vercelはこのファイルを独立したAPIエンドポイントとして扱わない。

const { createClient } = require("@supabase/supabase-js");

function extractBearerToken(req) {
  const header = req.headers && req.headers["authorization"];
  if (!header || !header.startsWith("Bearer ")) {
    return null;
  }
  return header.slice(7).trim();
}

// 戻り値：ログインしていれば { user, supabase }、していなければnull
async function getAuthenticatedUser(req) {
  const token = extractBearerToken(req);
  if (!token) {
    return null;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: "Bearer " + token } },
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data || !data.user) {
    return null;
  }

  return { user: data.user, supabase };
}

module.exports = { getAuthenticatedUser };
