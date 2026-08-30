// BookHub: Google Books APIを検索するためのサーバー関数（Vercelが自動で動かす）。
//
// APIキーはGitHubに公開しているコードには書かず、Vercelの環境変数として保存し、
// この関数経由（サーバー側）でのみ読み込む。ブラウザには一切渡さない。
// フロントエンドはGoogle Books APIへ直接アクセスせず、必ずこのエンドポイント経由で検索する
// （js/services/googleBooks.jsのsearchGoogleBooks参照）。
//
// Google Books APIが503（backendError）を返し続ける場合に備えて、
// 指数バックオフでのリトライ→Open Library APIへのフォールバック→
// それでも失敗したら0件の検索結果を返す、という3段構えにしている
// （ユーザーには常に「検索結果」を返し、サーバーエラーを見せない）。
//
// 必要なVercelの環境変数：
//   GOOGLE_BOOKS_API_KEY … Google Books APIのAPIキー
//
// 呼び出し方：
//   GET /api/books?q=検索ワード  を送ると
//   { "items": [ { title, author, publisher, publishedDate, pageCount, coverImage, isbn }, ... ] }
//   のような検索結果が返る。

const GOOGLE_BOOKS_ENDPOINT = "https://www.googleapis.com/books/v1/volumes";
const OPEN_LIBRARY_ENDPOINT = "https://openlibrary.org/search.json";

// country省略時、Google側はリクエスト元IPから国を自動判定するが、Vercelのサーバーレス関数が使う
// クラウドIPはこの自動判定に失敗しやすく、503 backendError（Googleのバックエンド内部エラー）の
// 原因になることが確認されている。country を明示指定してIPベース判定を回避する
const GOOGLE_BOOKS_COUNTRY = "JP";

// Google Books APIが503を返したときのリトライ回数・待ち時間（指数バックオフ）
const GOOGLE_BOOKS_MAX_RETRIES = 3;
const GOOGLE_BOOKS_RETRY_BASE_DELAY_MS = 300;

function sleep(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

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

// Google Books APIを1回呼ぶ。503（backendError）のときだけ、指数バックオフしながら
// 最大GOOGLE_BOOKS_MAX_RETRIES回リトライする（503以外のエラーは即座に投げる）
async function fetchGoogleBooksVolumes(q, apiKey) {
  const url =
    GOOGLE_BOOKS_ENDPOINT +
    "?maxResults=24&orderBy=relevance&q=" + encodeURIComponent(q) +
    "&country=" + encodeURIComponent(GOOGLE_BOOKS_COUNTRY) +
    "&key=" + encodeURIComponent(apiKey);

  for (let attempt = 0; attempt <= GOOGLE_BOOKS_MAX_RETRIES; attempt++) {
    const response = await fetch(url);

    if (response.ok) {
      const data = await response.json();
      return data.items || [];
    }

    const errorBody = await response.text();
    const error = new Error("Google Books APIエラー: " + response.status + " " + errorBody);
    error.status = response.status;

    const canRetry = response.status === 503 && attempt < GOOGLE_BOOKS_MAX_RETRIES;
    if (!canRetry) {
      throw error;
    }

    await sleep(GOOGLE_BOOKS_RETRY_BASE_DELAY_MS * Math.pow(2, attempt));
  }

  // ここには到達しない（ループ内で必ずreturnかthrowする）
  throw new Error("Google Books APIへのリクエストに失敗しました。");
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

// Google Books APIでの検索本体：ISBN検索 or 通常検索（0件なら緩いOR検索で再試行）
async function searchGoogleBooks(normalizedQuery, isbnDigits, apiKey) {
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

  return items.map(normalizeVolume);
}

// Open Library Search APIを1回呼ぶ（Google Books APIが失敗したときのフォールバック用）
async function fetchOpenLibraryDocs(q) {
  const url = OPEN_LIBRARY_ENDPOINT + "?limit=24&q=" + encodeURIComponent(q);

  const response = await fetch(url);
  if (!response.ok) {
    const errorBody = await response.text();
    const error = new Error("Open Library APIエラー: " + response.status + " " + errorBody);
    error.status = response.status;
    throw error;
  }
  const data = await response.json();
  return data.docs || [];
}

// Open Library APIの生データ1件を、Google Books版と同じ形に変換する
function normalizeOpenLibraryDoc(doc) {
  const isbnList = doc.isbn || [];
  const isbn13 = isbnList.find(function (code) {
    return code.length === 13;
  });
  const isbn10 = isbnList.find(function (code) {
    return code.length === 10;
  });

  return {
    id: doc.key || "",
    title: doc.title || "",
    author: (doc.author_name || []).join("、"),
    publisher: (doc.publisher || [])[0] || "",
    publishedDate: doc.first_publish_year ? String(doc.first_publish_year) : "",
    pageCount: doc.number_of_pages_median || null,
    coverImage: doc.cover_i ? "https://covers.openlibrary.org/b/id/" + doc.cover_i + "-L.jpg" : null,
    isbn: isbn13 || isbn10 || ""
  };
}

// Open Library APIでの検索本体：Google Books版と同じ順序（ISBN検索 or 通常検索→0件なら緩いOR検索）
async function searchOpenLibrary(normalizedQuery, isbnDigits) {
  let docs;

  if (isbnDigits) {
    docs = await fetchOpenLibraryDocs("isbn:" + isbnDigits);
  } else {
    docs = await fetchOpenLibraryDocs(normalizedQuery);
    if (docs.length === 0) {
      const looseQuery = buildLooseQuery(normalizedQuery);
      if (looseQuery) {
        docs = await fetchOpenLibraryDocs(looseQuery);
      }
    }
  }

  return docs.map(normalizeOpenLibraryDoc);
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
    const items = await searchGoogleBooks(normalizedQuery, isbnDigits, apiKey);
    res.status(200).json({ items: items });
    return;
  } catch (googleError) {
    console.error(
      "Google Books APIでの検索に失敗したため、Open Library APIへフォールバックします:",
      googleError
    );
  }

  try {
    const fallbackItems = await searchOpenLibrary(normalizedQuery, isbnDigits);
    res.status(200).json({ items: fallbackItems });
  } catch (fallbackError) {
    console.error("Open Library APIへのフォールバックにも失敗しました:", fallbackError);
    // Google・Open Libraryの両方が失敗した場合も、ユーザーにはエラーを見せず
    // 「0件の検索結果」として返す（フロント側は通常の0件表示になる）
    res.status(200).json({ items: [] });
  }
};
