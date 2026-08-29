// BookHub: Stripeサーバー用クライアントを1つだけ作って使い回すための共通処理。
//
// APIキー（STRIPE_SECRET_KEY）はGitHubに公開しているコードには書かず、Vercelの環境変数として保存し、
// ここ（サーバー側）でのみ読み込む。ブラウザには一切渡さない。
//
// ファイル名がアンダースコアで始まるディレクトリ（api/_lib）に置いているため、
// Vercelはこのファイルを独立したAPIエンドポイントとして扱わない。

const Stripe = require("stripe");

let client = null;

function getStripeClient() {
  if (!client) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      throw new Error("Stripeの環境変数（STRIPE_SECRET_KEY）が設定されていません。");
    }
    client = new Stripe(secretKey);
  }
  return client;
}

module.exports = { getStripeClient };
