// ---------- 本の検索（/api/books 経由でGoogle Books APIと通信） ----------
// Google Books APIへは直接アクセスせず、必ずこのサーバー関数（/api/books）を経由する
// （APIキーをブラウザに渡さないため）。呼び出し側はjs/screens/bookSearch.js参照。
//
// 同じ検索ワードを短時間で繰り返した場合は、通信をせずキャッシュを返す。

const GOOGLE_BOOKS_CACHE_TTL_MS = 60 * 1000; // このミリ秒以内の再検索はキャッシュを使う
const googleBooksSearchCache = new Map(); // 検索ワード（小文字化・前後空白除去済み） -> { timestamp, items }

// keyword（文字列）でGoogle Books APIを検索し、結果（配列）を返す。
// signal（任意・AbortSignal）を渡すと、呼び出し側で検索を打ち切れる（新しい検索が始まったときに古い通信を止めるため）。
async function searchGoogleBooks(keyword, signal) {
  const normalizedKeyword = keyword.trim().toLowerCase();

  const cached = googleBooksSearchCache.get(normalizedKeyword);
  if (cached && Date.now() - cached.timestamp < GOOGLE_BOOKS_CACHE_TTL_MS) {
    return cached.items;
  }

  let response;
  try {
    response = await fetch("/api/books?q=" + encodeURIComponent(keyword.trim()), { signal: signal });
  } catch (networkError) {
    if (networkError.name === "AbortError") {
      throw networkError; // 打ち切られた検索はそのまま呼び出し側へ伝える（エラー表示はしない）
    }
    console.error("[googleBooks] fetchが失敗しました（ネットワークエラー）:", networkError);
    throw new Error("検索に失敗しました。時間を置いて再度お試しください。");
  }

  const rawBody = await response.text();
  let data = {};
  try {
    data = rawBody ? JSON.parse(rawBody) : {};
  } catch (parseError) {
    console.error("[googleBooks] レスポンスをJSONとして解析できませんでした:", parseError);
  }

  if (!response.ok) {
    console.error("[googleBooks] APIエラー:", { status: response.status, data });
    throw new Error(data.error || "検索に失敗しました。時間を置いて再度お試しください。");
  }

  const items = data.items || [];
  googleBooksSearchCache.set(normalizedKeyword, { timestamp: Date.now(), items: items });
  return items;
}
