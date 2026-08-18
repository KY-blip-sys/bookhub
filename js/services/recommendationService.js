// ---------- おすすめ機能：読書傾向の集計とGoogle Books APIからの取得 ----------
// AIは使わず、「登録している本のカテゴリ・著者の集計」と「Google Books API」だけでおすすめの本を選ぶ。
// ダッシュボードの「あなたへのおすすめ」カード（screens/dashboardRecommend.js）から呼び出される。

const RECOMMEND_TARGET_COUNT = 10; // 取得したいおすすめ件数の目安

// 読書傾向（カテゴリ・著者）が集計できない、または件数が足りないときに補う人気カテゴリ
const RECOMMEND_FALLBACK_CATEGORIES = ["ビジネス", "自己啓発", "小説", "エッセイ", "生き方"];

// ---------- 読書傾向の集計 ----------

// 名前（カテゴリ名・著者名）ごとの登録冊数を集計し、多い順の配列 [{ name, count }] を返す
function countRecommendationTendencyNames(names) {
  const counts = {};
  names.forEach(function (name) {
    const trimmed = (name || "").trim();
    if (!trimmed) {
      return;
    }
    counts[trimmed] = (counts[trimmed] || 0) + 1;
  });

  return Object.keys(counts)
    .map(function (name) {
      return { name: name, count: counts[name] };
    })
    .sort(function (a, b) {
      return b.count - a.count;
    });
}

// 登録している本から、カテゴリ（ジャンル）・著者それぞれの登録数が多い順の一覧を求める
function getReadingTendency(books) {
  const genreNames = books.map(function (book) {
    return book.genre;
  });

  // 1冊に複数の著者が入っていることがある（「、」区切り）ため、著者ごとに分けてから集計する
  const authorNames = [];
  books.forEach(function (book) {
    (book.author || "").split("、").forEach(function (name) {
      authorNames.push(name);
    });
  });

  return {
    genres: countRecommendationTendencyNames(genreNames),
    authors: countRecommendationTendencyNames(authorNames)
  };
}

// ---------- Google Books APIからの取得 ----------

// Google Books APIの1件を、おすすめカードで使う共通の形に変換する
function normalizeRecommendationItem(item) {
  const info = item.volumeInfo || {};
  const hasThumbnail = info.imageLinks && info.imageLinks.thumbnail;

  return {
    title: info.title || "",
    author: (info.authors || []).join("、"),
    genre: (info.categories || [])[0] || "",
    isbn: pickPreferredIsbn(info.industryIdentifiers),
    pageCount: info.pageCount || null,
    thumbnail: hasThumbnail ? info.imageLinks.thumbnail.replace("http://", "https://") : null,
    infoLink: info.infoLink || null
  };
}

// field: "subject"（カテゴリ）または "inauthor"（著者）でGoogle Books APIを検索する。
// 通信・APIのエラーはここで吸収して空配列を返す（呼び出し側は次の優先順位に進むだけでよい）
function fetchGoogleBooksByField(field, value, maxResults) {
  if (!value || maxResults <= 0) {
    return Promise.resolve([]);
  }

  const apiKey = loadGoogleBooksApiKey();
  const keyParam = apiKey ? "&key=" + encodeURIComponent(apiKey) : "";
  const url =
    "https://www.googleapis.com/books/v1/volumes?q=" +
    encodeURIComponent(field + ":\"" + value + "\"") +
    "&maxResults=" + maxResults + "&langRestrict=ja" + keyParam;

  return fetch(url, { referrerPolicy: "no-referrer-when-downgrade" })
    .then(function (response) {
      if (!response.ok) {
        throw new Error("Google Books APIの取得に失敗しました（ステータスコード: " + response.status + "）");
      }
      return response.json();
    })
    .then(function (data) {
      return (data.items || []).map(normalizeRecommendationItem);
    })
    .catch(function (error) {
      console.error("[あなたへのおすすめ] " + field + ":\"" + value + "\" の取得に失敗しました:", error);
      return [];
    });
}

// ---------- 重複除外 ----------

// 比較しやすいように、タイトルの前後の空白を取り除き小文字化する
function normalizeTitleForCompare(title) {
  return (title || "").trim().toLowerCase();
}

// すでに登録されている本（タイトルまたはISBNが一致するもの）を候補から取り除く
function excludeAlreadyRegisteredBooks(candidates, registeredBooks) {
  const registeredTitles = registeredBooks.map(function (book) {
    return normalizeTitleForCompare(book.title);
  });
  const registeredIsbns = registeredBooks
    .map(function (book) {
      return book.isbn;
    })
    .filter(Boolean);

  return candidates.filter(function (candidate) {
    if (candidate.isbn && registeredIsbns.indexOf(candidate.isbn) !== -1) {
      return false;
    }
    return registeredTitles.indexOf(normalizeTitleForCompare(candidate.title)) === -1;
  });
}

// おすすめ候補どうしの重複（同じ本が複数の検索でヒットした場合）を、タイトル・ISBNで取り除く
function dedupeRecommendationCandidates(candidates) {
  const seenTitles = {};
  const seenIsbns = {};

  return candidates.filter(function (candidate) {
    if (!candidate.title) {
      return false;
    }
    if (candidate.isbn) {
      if (seenIsbns[candidate.isbn]) {
        return false;
      }
      seenIsbns[candidate.isbn] = true;
    }
    const titleKey = normalizeTitleForCompare(candidate.title);
    if (seenTitles[titleKey]) {
      return false;
    }
    seenTitles[titleKey] = true;
    return true;
  });
}

// ---------- 取得の司令塔 ----------

// 優先順位（1: 最も多いカテゴリ → 2: 最も多い著者 → 3: 人気カテゴリ）にしたがって、
// 件数がRECOMMEND_TARGET_COUNTに達するまで、順番にGoogle Books APIから候補を集める
function collectRecommendationCandidates(tendency) {
  const topGenre = tendency.genres[0] && tendency.genres[0].name;
  const topAuthor = tendency.authors[0] && tendency.authors[0].name;

  let collected = [];

  function addResults(results) {
    collected = dedupeRecommendationCandidates(collected.concat(results));
  }

  function remainingCount() {
    return Math.max(0, RECOMMEND_TARGET_COUNT - collected.length);
  }

  // 3. 人気カテゴリを、足りない分だけ順番に補う（1・2で十分な件数が集まっていれば呼ばれない）
  function fillWithFallbackCategories(index) {
    if (remainingCount() === 0 || index >= RECOMMEND_FALLBACK_CATEGORIES.length) {
      return collected;
    }
    return fetchGoogleBooksByField("subject", RECOMMEND_FALLBACK_CATEGORIES[index], remainingCount())
      .then(function (fallbackResults) {
        addResults(fallbackResults);
        return fillWithFallbackCategories(index + 1);
      });
  }

  // 1. 最も多いカテゴリから取得
  return fetchGoogleBooksByField("subject", topGenre, RECOMMEND_TARGET_COUNT)
    .then(function (results) {
      addResults(results);
      // 2. 最も多い著者から取得
      return fetchGoogleBooksByField("inauthor", topAuthor, remainingCount());
    })
    .then(function (results) {
      addResults(results);
      return fillWithFallbackCategories(0);
    });
}

// おすすめの本を取得する（ダッシュボードから呼ぶメインの入口）。
// 読書傾向の集計 → Google Books APIからの取得 → 登録済みの本の除外 → 件数を絞る、までをまとめて行う。
function fetchRecommendedBooks() {
  const registeredBooks = loadBooks();
  const tendency = getReadingTendency(registeredBooks);

  return collectRecommendationCandidates(tendency).then(function (candidates) {
    return excludeAlreadyRegisteredBooks(candidates, registeredBooks).slice(0, RECOMMEND_TARGET_COUNT);
  });
}
