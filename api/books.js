// BookHub: Google Books APIを検索するためのサーバー関数（Vercelが自動で動かす）。
//
// APIキーはGitHubに公開しているコードには書かず、Vercelの環境変数として保存し、
// この関数経由（サーバー側）でのみ読み込む。ブラウザには一切渡さない。
// フロントエンドはGoogle Books APIへ直接アクセスせず、必ずこのエンドポイント経由で検索する
// （js/services/googleBooks.jsのsearchGoogleBooks参照）。
//
// 必要なVercelの環境変数：
//   GOOGLE_BOOKS_API_KEY … Google Books APIのAPIキー
//
// 呼び出し方：
//   GET /api/books?q=検索ワード  を送ると
//   { "items": [ { title, author, publisher, publishedDate, pageCount, coverImage, isbn }, ... ] }
//   のような検索結果が返る。

const GOOGLE_BOOKS_ENDPOINT = "https://www.googleapis.com/books/v1/volumes";

// Google Books APIの生データ1件を、このアプリで使う共通の形に変換する
function normalizeVolume(item) {
  const info = item.volumeInfo || {};
  const identifiers = info.industryIdentifiers || [];
  const isbn13 = identifiers.find(function (identifier) {
    return identifier.type === "ISBN_13";
  });
  const isbn10 = identifiers.find(function (identifier) {
    return identifier.type === "ISBN_10";
  });
  const thumbnail = info.imageLinks && info.imageLinks.thumbnail;

  return {
    id: item.id,
    title: info.title || "",
    author: (info.authors || []).join("、"),
    publisher: info.publisher || "",
    publishedDate: info.publishedDate || "",
    pageCount: info.pageCount || null,
    // httpのままだと表示できない場合があるので、httpsに変換しておく
    coverImage: thumbnail ? thumbnail.replace("http://", "https://") : null,
    isbn: (isbn13 || isbn10 || {}).identifier || ""
  };
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    res.status(405).json({ error: "このAPIはGETメソッドのみ対応しています。" });
    return;
  }

  if (!process.env.GOOGLE_BOOKS_API_KEY) {
    res.status(500).json({
      error: "Google Books APIの環境変数（GOOGLE_BOOKS_API_KEY）がVercelに設定されていません。"
    });
    return;
  }

  const q = req.query ? req.query.q : undefined;
  if (!q || typeof q !== "string" || !q.trim()) {
    res.status(400).json({ error: "q（検索キーワード）を指定してください。" });
    return;
  }

  try {
    const url =
      GOOGLE_BOOKS_ENDPOINT +
      "?maxResults=20&q=" + encodeURIComponent(q.trim()) +
      "&key=" + encodeURIComponent(process.env.GOOGLE_BOOKS_API_KEY);

    const response = await fetch(url);

    if (!response.ok) {
      console.error("Google Books APIエラー:", response.status, await response.text());
      res.status(502).json({
        error: "Google Books APIとの通信でエラーが発生しました。しばらくしてから再試行してください。"
      });
      return;
    }

    const data = await response.json();
    const items = (data.items || []).map(normalizeVolume);

    res.status(200).json({ items });
  } catch (error) {
    console.error("本の検索処理でエラーが発生しました:", error);
    res.status(500).json({
      error: "本の検索中にエラーが発生しました。しばらくしてから再試行してください。"
    });
  }
};
