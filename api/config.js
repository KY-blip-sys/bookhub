// BookHub: ブラウザ側にSupabaseの接続情報を渡すためのサーバー関数（Vercelが自動で動かす）。
//
// SupabaseのURLとanon keyは「公開しても良い鍵」（RLS＝行単位のセキュリティで保護される前提の鍵）だが、
// GitHubに公開しているコードに直接書きたくないため、Vercelの環境変数として保存し、
// この関数経由でその場で読み込む。secret key（service_role key）はここでは一切扱わない。
//
// 必要なVercelの環境変数：
//   SUPABASE_URL       … SupabaseプロジェクトのProject URL
//   SUPABASE_ANON_KEY   … Supabaseプロジェクトのanon / public key

module.exports = function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    res.status(500).json({
      error: "Supabaseの環境変数（SUPABASE_URL / SUPABASE_ANON_KEY）がVercelに設定されていません。"
    });
    return;
  }

  res.status(200).json({ supabaseUrl, supabaseAnonKey });
};
