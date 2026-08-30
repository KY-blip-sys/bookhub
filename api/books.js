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

// 全角の英数字・スペースを半角に変換する（日本語IMEで検索語を打つと全角になりがちなため、
// 半角前提のISBN判定・Google Books側の検索一致率の両方を改善する）
function normalizeQueryText(text) {
  return text
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, function (char) {
      return String.fromCharCode(char.charCodeAt(0) - 0xfee0);
    })
    .replace(/　/g, " ")
    .trim();
}

// ISBN検索かどうかを判定する（ハイフン・スペース除去後、10桁または13桁の数字。
// 末尾のXはISBN-10のチェックデジットとして許容する）
function extractIsbnDigits(query) {
  const stripped = query.replace(/[-\s]/g, "");
  if (/^\d{9}[\dXx]$/.test(stripped) || /^\d{13}$/.test(stripped)) {
    return stripped.toUpperCase();
  }
  return null;
}

// キーワードをそのまま渡すと、日本語の区切りが原因で0件になることがある。
// 空白区切りの単語をOR条件にして、どれか1語でも一致すれば拾えるようにした、緩めのクエリを組み立てる
// （タイトルの一部だけ・うろ覚えの単語での検索に強くするため）
function buildLooseQuery(query) {
  const words = query.split(/\s+/).filter(Boolean);
  if (words.length < 2) {
    return null;
  }
  return words.join(" OR ");
}

async function fetchGoogleBooksVolumes(q, apiKey) {
  const url =
    GOOGLE_BOOKS_ENDPOINT +
    "?maxResults=24&orderBy=relevance&q=" + encodeURIComponent(q) +
    "&key=" + encodeURIComponent(apiKey);

  const response = await fetch(url);
  if (!response.ok) {
    const errorBody = await response.text();
    const error = new Error("Google Books APIエラー: " + response.status + " " + errorBody);
    error.status = response.status;
    throw error;
  }
  const data = await response.json();
  return data.items || [];
}

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

  const apiKey = process.env.GOOGLE_BOOKS_API_KEY;
  const normalizedQuery = normalizeQueryText(q);
  const isbnDigits = extractIsbnDigits(normalizedQuery);

  try {
    let items;

    if (isbnDigits) {
      // ISBNらしき入力は、あいまい検索よりも「その本をピンポイントで当てる」ことを優先する
      items = await fetchGoogleBooksVolumes("isbn:" + isbnDigits, apiKey);
    } else {
      // 通常検索：タイトル・著者名どちらで打っても引っかかるよう、フィールド指定はせず全文検索にする
      items = await fetchGoogleBooksVolumes(normalizedQuery, apiKey);

      // 0件のときは、単語区切りをOR条件にした緩い検索で再試行する
      // （複数単語のうち1語だけ違う・うろ覚えのタイトルでも候補を出せるようにするため）
      if (items.length === 0) {
        const looseQuery = buildLooseQuery(normalizedQuery);
        if (looseQuery) {
          items = await fetchGoogleBooksVolumes(looseQuery, apiKey);
        }
      }
    }

    res.status(200).json({ items: items.map(normalizeVolume) });
  } catch (error) {
    console.error("本の検索処理でエラーが発生しました:", error);
    if (error.status) {
      res.status(502).json({
        error: "Google Books APIとの通信でエラーが発生しました。しばらくしてから再試行してください。"
      });
      return;
    }
    res.status(500).json({
      error: "本の検索中にエラーが発生しました。しばらくしてから再試行してください。"
    });
  }
};
