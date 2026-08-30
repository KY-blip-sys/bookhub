// BookHub: リクエストからオリジン（https://example.com のような形）を組み立てる共通処理。
//
// Stripe Checkout（api/stripe/create-checkout-session.js）・Stripe Customer Portal
// （api/stripe/create-portal-session.js）のどちらも、決済・管理画面からBookHubへ戻ってくる
// success_url/cancel_url/return_urlの組み立てに使う。
// NEXT_PUBLIC_APP_URLのような固定の環境変数は使わず、Vercelが付与するリクエストヘッダーから
// その場で組み立てる（プレビューデプロイごとにドメインが変わっても環境変数の設定し直しが不要なため）。
//
// ファイル名がアンダースコアで始まるディレクトリ（api/_lib）に置いているため、
// Vercelはこのファイルを独立したAPIエンドポイントとして扱わない。

// カンマ区切りで複数の値が入ることがあるヘッダー（プロキシを経由すると付与されうる）から、
// 一番手前（＝実際のリクエスト元に一番近い値）だけを取り出す
function firstHeaderValue(headerValue) {
  const raw = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  return raw ? raw.split(",")[0].trim() : null;
}

function resolveOrigin(req) {
  const proto = firstHeaderValue(req.headers["x-forwarded-proto"]) || "https";
  const host = firstHeaderValue(req.headers["x-forwarded-host"]) || firstHeaderValue(req.headers.host);
  if (!host) {
    throw new Error("リクエストのHostヘッダーが取得できず、success_url/cancel_url/return_urlを組み立てられませんでした。");
  }
  return proto + "://" + host;
}

module.exports = { resolveOrigin };
