// ---------- おすすめ機能：読書傾向の集計とGoogle Books APIからの取得 ----------
// AIは使わず、「登録している本のカテゴリ・著者の集計」と「Google Books API」だけでおすすめの本を選ぶ。
// ダッシュボードの「あなたへのおすすめ」カード（screens/dashboardRecommend.js）から呼び出される。
//
// 実用書・小説では読者が求めるものが違うため、優先順位（どの条件で検索するか・その順番）を
// アクティブなカテゴリ（"practical" | "novel"）ごとに分ける（下のcollectPracticalCandidates／
// collectNovelCandidatesを参照）。読書傾向の集計自体も、今開いているカテゴリの本だけを対象にする
// （実用書を読んでいるときに小説のジャンル・著者が混ざらないように、その逆も同様）。

const RECOMMEND_TARGET_COUNT = 10; // 取得したいおすすめ件数の目安

// 読書傾向（カテゴリ・著者）が集計できない、または件数が足りないときに補う人気カテゴリ。
// 実用書・小説で求められる本の傾向が違うため、カテゴリごとに別のリストを用意する
const RECOMMEND_FALLBACK_CATEGORIES_BY_CATEGORY = {
  practical: ["ビジネス", "自己啓発", "生き方", "エッセイ", "心理学"],
  novel: ["小説", "ミステリー", "恋愛小説", "SF", "ファンタジー"]
};

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

// field: "subject"（カテゴリ）・"inauthor"（著者）・"intitle"（タイトル。シリーズ作品の推測に使う）で
// Google Books APIを検索する。通信・APIのエラーはここで吸収して空配列を返す（呼び出し側は次の優先順位に進むだけでよい）。
// startIndexを指定すると、同じ条件でも1ページ分ずらした続きの結果を取得できる
// （小説の「同ジャンルの人気作品」で、①で取得済みの上位と重複しない次点の候補を取るために使う）
function fetchGoogleBooksByField(field, value, maxResults, startIndex) {
  if (!value || maxResults <= 0) {
    return Promise.resolve([]);
  }

  const apiKey = loadGoogleBooksApiKey();
  const keyParam = apiKey ? "&key=" + encodeURIComponent(apiKey) : "";
  const startIndexParam = startIndex ? "&startIndex=" + startIndex : "";
  const url =
    "https://www.googleapis.com/books/v1/volumes?q=" +
    encodeURIComponent(field + ":\"" + value + "\"") +
    "&maxResults=" + maxResults + "&langRestrict=ja" + keyParam + startIndexParam;

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

// ---------- 小説：シリーズ作品の推測 ----------
// Google Books APIの検索にはシリーズを示す情報が無いため、登録済みの小説のタイトル末尾から
// 「第2巻」「(3)」「3」のような巻数・話数表記を取り除き、シリーズ共通と思われる部分だけを取り出す。
// 取り除いた結果がもとのタイトルと変わらない（＝巻数表記が見つからなかった）場合は、
// シリーズ作品では無いと判断してnullを返す
function guessSeriesBaseTitle(title) {
  const trimmed = (title || "").trim();
  const stripped = trimmed
    .replace(/[\s　]*[（(][^）)]*[）)]\s*$/, "") // 末尾の（〜）／(〜)
    .replace(/[\s　]*第?\s*[0-9０-９一二三四五六七八九十百]+\s*(巻|部|章|話|集)\s*$/, "") // 「第3巻」「3巻」など
    .replace(/[\s　]*[0-9０-９]+\s*$/, "") // 末尾だけの数字（「〇〇 3」など）
    .trim();

  if (!stripped || stripped === trimmed) {
    return null;
  }
  return stripped;
}

// 登録している小説の中から、シリーズ作品と思われるタイトルを1件だけ選び、続刊を探すためのクエリにする
// （直近に登録した本ほど今の読書傾向を反映していると考え、新しく登録された順＝配列の後ろから探す）
function guessNovelSeriesQuery(novels) {
  for (let i = novels.length - 1; i >= 0; i--) {
    const baseTitle = guessSeriesBaseTitle(novels[i].title);
    if (baseTitle) {
      return baseTitle;
    }
  }
  return null;
}

// ---------- 取得の司令塔 ----------
// 実用書・小説では読者が求めるものが違うため、どの条件でどの順に検索するかをカテゴリごとに分ける。
// 「候補を集める・重複を除く・残り枠を数える」という下地の処理は共通なので、この関数の中にまとめ、
// 実際の優先順位（検索条件の並び）だけを実用書／小説それぞれのthenチェーンで組み立てる。
function collectRecommendationCandidates(category, tendency, categoryBooks) {
  const fallbackCategories = RECOMMEND_FALLBACK_CATEGORIES_BY_CATEGORY[category]
    || RECOMMEND_FALLBACK_CATEGORIES_BY_CATEGORY.practical;

  const topGenre = tendency.genres[0] && tendency.genres[0].name;
  const relatedGenre = tendency.genres[1] && tendency.genres[1].name; // 2番目に多いジャンル＝「関連ジャンル」として使う
  const topAuthor = tendency.authors[0] && tendency.authors[0].name;

  let collected = [];

  function addResults(results) {
    collected = dedupeRecommendationCandidates(collected.concat(results));
  }

  function remainingCount() {
    return Math.max(0, RECOMMEND_TARGET_COUNT - collected.length);
  }

  // 最後の砦：人気カテゴリを、足りない分だけ順番に補う（他の条件で十分な件数が集まっていれば呼ばれない）
  function fillWithFallbackCategories(index) {
    if (remainingCount() === 0 || index >= fallbackCategories.length) {
      return collected;
    }
    return fetchGoogleBooksByField("subject", fallbackCategories[index], remainingCount())
      .then(function (fallbackResults) {
        addResults(fallbackResults);
        return fillWithFallbackCategories(index + 1);
      });
  }

  if (category === "novel") {
    // 小説：①同じジャンル ②同じ著者 ③シリーズ作品（続刊） ④同ジャンルの人気作品 ⑤人気カテゴリ（それでも足りない場合）
    const seriesQuery = guessNovelSeriesQuery(categoryBooks);

    return fetchGoogleBooksByField("subject", topGenre, RECOMMEND_TARGET_COUNT)
      .then(function (results) {
        addResults(results);
        return fetchGoogleBooksByField("inauthor", topAuthor, remainingCount());
      })
      .then(function (results) {
        addResults(results);
        return fetchGoogleBooksByField("intitle", seriesQuery, remainingCount());
      })
      .then(function (results) {
        addResults(results);
        // ④同ジャンルの人気作品：①と同じジャンルの続き（startIndexで次点の候補にずらす）を追加で補う
        return fetchGoogleBooksByField("subject", topGenre, remainingCount(), RECOMMEND_TARGET_COUNT);
      })
      .then(function (results) {
        addResults(results);
        return fillWithFallbackCategories(0);
      });
  }

  // 実用書：①同じカテゴリ ②関連ジャンル ③同じ著者 ④人気カテゴリ（それでも足りない場合）
  return fetchGoogleBooksByField("subject", topGenre, RECOMMEND_TARGET_COUNT)
    .then(function (results) {
      addResults(results);
      return fetchGoogleBooksByField("subject", relatedGenre, remainingCount());
    })
    .then(function (results) {
      addResults(results);
      return fetchGoogleBooksByField("inauthor", topAuthor, remainingCount());
    })
    .then(function (results) {
      addResults(results);
      return fillWithFallbackCategories(0);
    });
}

// おすすめの本を取得する（ダッシュボードから呼ぶメインの入口）。
// 読書傾向の集計（今開いているカテゴリの本だけを対象にし、実用書・小説のおすすめが混ざらないようにする）
// → Google Books APIからの取得 → 登録済みの本の除外（カテゴリを問わず、持っている本は勧めない）
// → 件数を絞る、までをまとめて行う。
function fetchRecommendedBooks() {
  const activeCategory = loadActiveCategory();
  const allBooks = loadBooks();
  const categoryBooks = activeCategory
    ? allBooks.filter(function (book) { return book.category === activeCategory; })
    : allBooks;

  const tendency = getReadingTendency(categoryBooks);

  return collectRecommendationCandidates(activeCategory, tendency, categoryBooks).then(function (candidates) {
    return excludeAlreadyRegisteredBooks(candidates, allBooks).slice(0, RECOMMEND_TARGET_COUNT);
  });
}
