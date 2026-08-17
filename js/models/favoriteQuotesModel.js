// ---------- 好きな言葉（読書記録とは別に、画面から直接追加した分）のデータ ----------
// 読書記録の「印象に残ったセリフ」「名言・印象に残った言葉」は本を読んでいる最中にしか書けないが、
// こちらは「好きな言葉」「名言集」画面からいつでも自由に追加できる、独立したコレクション。
//
// 保存する項目：id / bookId（任意。本を選ばなければnull） / text / createdAt / category
// categoryは、bookIdが無い（本を選ばずに追加した）ときに、小説の言葉か実用書の名言かを区別するために使う。
// bookIdがある場合は、その本のカテゴリを正として扱う。

const FAVORITE_QUOTES_KEY = "reading-app-favorite-quotes";

// 保存されている好きな言葉が古い形の場合に、今の形へ補う
// （例：categoryが無い言葉は、これまで通りすべて小説の好きな言葉として扱う）
function normalizeFavoriteQuote(quote) {
  if (!quote.category) {
    quote.category = "novel";
  }
  return quote;
}

function loadFavoriteQuotes() {
  return loadJSON(FAVORITE_QUOTES_KEY, []).map(normalizeFavoriteQuote);
}

function saveFavoriteQuotes(quotes) {
  saveJSON(FAVORITE_QUOTES_KEY, quotes);
}

// 好きな言葉を1件追加する（bookIdは任意。選ばなければnull。categoryは省略時「novel」）
function addFavoriteQuote(bookId, text, category) {
  const quotes = loadFavoriteQuotes();
  quotes.push({
    id: Date.now(),
    bookId: bookId || null,
    text: text,
    createdAt: Date.now(),
    category: category || "novel"
  });
  saveFavoriteQuotes(quotes);
}

// 好きな言葉の本文を更新する
function updateFavoriteQuote(quoteId, text) {
  const quotes = loadFavoriteQuotes();
  const quote = quotes.find(function (q) {
    return q.id === quoteId;
  });
  if (!quote) {
    return;
  }
  quote.text = text;
  saveFavoriteQuotes(quotes);
}

// 好きな言葉を削除する
function deleteFavoriteQuote(quoteId) {
  const quotes = loadFavoriteQuotes();
  const remaining = quotes.filter(function (q) {
    return q.id !== quoteId;
  });
  saveFavoriteQuotes(remaining);
}
