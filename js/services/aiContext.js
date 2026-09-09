// ---------- AI機能で共通して使う「読書データの要約」 ----------
// おすすめ本・クイズ・要約・学習コーチは、どれも「これまでの読書記録」をAIに渡す必要があるため、
// その組み立てをここに1つにまとめる（機能ごとに読書データの集計処理を重複させない）。
// 学んだこと・感想が多い本は文章量が膨らみすぎるため、本1冊あたりの件数に上限を設けて間引く。

const AI_CONTEXT_NOTES_PER_BOOK_LIMIT = 8;

// 本1冊分の記録・レビューから、学んだこと／感想のテキストだけを集める
// （実用書＝learning・quote、小説＝impression・memorableQuote・notesを対象にする）
function collectAiNotesForBook(book) {
  const learnings = [];
  const impressions = [];

  book.records.forEach(function (record) {
    if (record.learning) {
      learnings.push(record.learning);
    }
    if (record.impression) {
      impressions.push(record.impression);
    }
    if (record.notes) {
      impressions.push(record.notes);
    }
  });

  loadFavoriteLearnings()
    .filter(function (learning) {
      return learning.bookId === book.id;
    })
    .forEach(function (learning) {
      learnings.push(learning.text);
    });

  const review = getReviewForBook(book.id);
  if (review && review.body) {
    impressions.push(review.body);
  }

  return {
    learnings: learnings.slice(-AI_CONTEXT_NOTES_PER_BOOK_LIMIT),
    impressions: impressions.slice(-AI_CONTEXT_NOTES_PER_BOOK_LIMIT)
  };
}

// 本1冊分の記録・「好きな言葉」から、ハイライト（印象に残ったセリフ・名言）のテキストだけを集める
// （js/screens/quotes.jsのgetCombinedQuotesと同じ2つのソース＝読書記録由来／直接追加分を対象にする）
function collectAiHighlightsForBook(book) {
  const quoteFieldName = book.category === "novel" ? "memorableQuote" : "quote";
  const highlights = [];

  book.records.forEach(function (record) {
    if (record[quoteFieldName]) {
      highlights.push(record[quoteFieldName]);
    }
  });

  loadFavoriteQuotes()
    .filter(function (quote) {
      return quote.bookId === book.id;
    })
    .forEach(function (quote) {
      highlights.push(quote.text);
    });

  return highlights.slice(-AI_CONTEXT_NOTES_PER_BOOK_LIMIT);
}

// AIに渡す「読書データ」を、本ごとにまとめた配列にする（実用書・小説の両カテゴリが対象）
function buildAiReadingContext() {
  return loadBooks().map(function (book) {
    const notes = collectAiNotesForBook(book);
    return {
      id: book.id,
      title: book.title,
      author: book.author || "",
      genre: book.category === "novel" ? "小説" : "実用書",
      status: getBookStatusInfo(book).label,
      totalMinutes: getTotalMinutes([book]),
      learnings: notes.learnings,
      impressions: notes.impressions,
      highlights: collectAiHighlightsForBook(book)
    };
  });
}

// buildAiReadingContext()の結果を、AIに読ませるための日本語の文章に整形する
function formatAiReadingContext(context) {
  if (context.length === 0) {
    return "（まだ読書記録がありません）";
  }

  return context.map(function (book, index) {
    const lines = [
      (index + 1) + ". 『" + book.title + "』" + (book.author ? " / " + book.author : ""),
      "  ジャンル: " + book.genre + " ／ ステータス: " + book.status + " ／ 読書時間: " + book.totalMinutes + "分"
    ];
    if (book.learnings.length > 0) {
      lines.push("  学んだこと・メモ: " + book.learnings.join(" ／ "));
    }
    if (book.impressions.length > 0) {
      lines.push("  感想: " + book.impressions.join(" ／ "));
    }
    return lines.join("\n");
  }).join("\n\n");
}

// 学んだこと・感想が1件でもある本だけに絞り込む（要約は、メモが無い本を材料にできないため）
function filterAiContextWithNotes(context) {
  return context.filter(function (book) {
    return book.learnings.length > 0 || book.impressions.length > 0;
  });
}

// 学んだこと・感想・ハイライトのいずれか1件でもある本だけに絞り込む
// （クイズは、そのどれか1つでも材料があれば出題できるため）
function filterAiContextForQuiz(context) {
  return context.filter(function (book) {
    return book.learnings.length > 0 || book.impressions.length > 0 || book.highlights.length > 0;
  });
}

// buildAiReadingContext()の結果を、クイズ専用の文章に整形する（filterAiContextForQuizで
// 絞り込んだあとのcontextを渡す）。bookIdを渡すと、その本1冊分だけに絞り込む
// （本の詳細画面からクイズを作るとき用）。
//
// 学んだこと・感想の両方を1冊分まとめて渡すと、事実（学んだこと）と主観（感想・メモ）が
// 混ざり合って「意味の通らないクイズ」になりやすいため、本1冊につき「学んだこと」があれば
// それだけを使い、無い本（小説など、感想・メモしか記録がない本）だけ感想・メモを代わりに使う。
// ハイライト（好きな言葉・名言）は、どちらの場合でもあれば追加の材料として渡す
function formatAiLearningsContext(context, bookId) {
  const target = bookId
    ? context.filter(function (book) { return book.id === bookId; })
    : context;

  if (target.length === 0) {
    return "（学んだこと・感想・ハイライトの記録がありません）";
  }

  return target.map(function (book, index) {
    const lines = [(index + 1) + ". 『" + book.title + "』" + (book.author ? " / " + book.author : "")];
    if (book.learnings.length > 0) {
      lines.push("  学んだこと: " + book.learnings.join(" ／ "));
    } else if (book.impressions.length > 0) {
      lines.push("  感想・メモ: " + book.impressions.join(" ／ "));
    }
    if (book.highlights.length > 0) {
      lines.push("  ハイライト（好きな言葉・名言）: " + book.highlights.join(" ／ "));
    }
    return lines.join("\n");
  }).join("\n\n");
}

// 数値（1〜5など）を★の文字列に変換する（おすすめ本の難易度・おすすめ度の表示で使う）
function renderAiStars(count, max) {
  const total = max || 5;
  return "★".repeat(count) + "☆".repeat(Math.max(0, total - count));
}
