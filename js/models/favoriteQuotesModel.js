// ---------- 好きな言葉のデータ（Supabaseのfavorite_quotesテーブルへの保存・読み込み） ----------
// 読書記録の「印象に残ったセリフ」「名言・印象に残った言葉」は本を読んでいる最中にしか書けないが、
// こちらは「好きな言葉」「名言集」画面からいつでも自由に追加できる、独立したコレクション（この考え方は変わらない）。
//
// 保存する項目：id / bookId（任意。本を選ばなければnull） / text / createdAt / category
// categoryは、bookIdが無い（本を選ばずに追加した）ときに、小説の言葉か実用書の名言かを区別するために使う。
// bookIdがある場合は、その本のカテゴリを正として扱う。
//
// loadFavoriteQuotes()・saveFavoriteQuotes()は、他の画面から見れば以前と同じ「同期的な関数」の
// まま使えるように、メモリ上のキャッシュ（cachedFavoriteQuotes）を介してSupabaseとやり取りする：
// ・loadFavoriteQuotes()は、キャッシュの複製を返す（呼び出し側が中身を直接書き換えても、
//   キャッシュ自体は変わらないようにするため）
// ・saveFavoriteQuotes(quotes)は、渡された配列をキャッシュ（＝直前の状態）と見比べて、
//   追加・変更・削除された分だけをSupabaseのfavorite_quotesテーブルへ反映する（結果を待たない「投げっぱなし」）

const LEGACY_FAVORITE_QUOTES_KEY = "reading-app-favorite-quotes"; // 移行前の旧データ（ローカル）

let cachedFavoriteQuotes = [];

// 保存されている好きな言葉が古い形の場合に、今の形へ補う
// （例：categoryが無い言葉は、これまで通りすべて小説の好きな言葉として扱う）
function normalizeFavoriteQuote(quote) {
  if (!quote.category) {
    quote.category = "novel";
  }
  return quote;
}

function cloneFavoriteQuote(quote) {
  return normalizeFavoriteQuote(JSON.parse(JSON.stringify(quote)));
}

function loadFavoriteQuotes() {
  return cachedFavoriteQuotes.map(cloneFavoriteQuote);
}

function saveFavoriteQuotes(quotes) {
  const previousById = {};
  cachedFavoriteQuotes.forEach(function (quote) {
    previousById[quote.id] = quote;
  });

  const nextIds = {};
  quotes.forEach(function (quote) {
    nextIds[quote.id] = true;

    const previous = previousById[quote.id];
    if (!previous) {
      queueFavoriteQuoteInsert(quote);
    } else if (favoriteQuoteSnapshot(previous) !== favoriteQuoteSnapshot(quote)) {
      queueFavoriteQuoteUpdate(quote);
    }
  });

  Object.keys(previousById).forEach(function (id) {
    if (!nextIds[id]) {
      queueFavoriteQuoteDelete(previousById[id].id);
    }
  });

  cachedFavoriteQuotes = quotes;
}

// 好きな言葉を1件追加する（bookIdは任意。選ばなければnull。categoryは省略時「novel」）
function addFavoriteQuote(bookId, text, category) {
  const quotes = loadFavoriteQuotes();
  quotes.push({
    id: generateFavoriteQuoteId(),
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

// ---------- Supabaseとの変換・読み書き ----------

// 新しい好きな言葉のidを発行する（Supabaseのfavorite_quotes.idがuuid型のため）
function generateFavoriteQuoteId() {
  return crypto.randomUUID();
}

// 中身を比べるためのスナップショット（idを除く。中身が同じならSupabaseへの更新を発生させない）
function favoriteQuoteSnapshot(quote) {
  return JSON.stringify({
    bookId: quote.bookId || null,
    text: quote.text,
    category: quote.category,
    createdAt: quote.createdAt || 0
  });
}

// アプリ内で使う好きな言葉の形 → Supabaseのfavorite_quotes行の形
function favoriteQuoteToSupabaseRow(quote) {
  return {
    id: quote.id,
    user_id: currentUserId, // js/services/cloudSync.js（ログイン中ユーザーのauth.uid()）
    book_id: quote.bookId || null,
    category: quote.category,
    text: quote.text,
    created_at: quote.createdAt ? new Date(quote.createdAt).toISOString() : new Date().toISOString()
  };
}

// Supabaseのfavorite_quotes行 → アプリ内で使う好きな言葉の形
function supabaseRowToFavoriteQuote(row) {
  return normalizeFavoriteQuote({
    id: row.id,
    bookId: row.book_id,
    category: row.category,
    text: row.text,
    createdAt: new Date(row.created_at).getTime()
  });
}

// js/services/cloudSync.jsの共通CRUD（ログイン確認・投げっぱなし送信・エラーログを1箇所にまとめたもの）
const favoriteQuotesCrud = createCloudCrud("favorite_quotes", "好きな言葉");

// 指定した好きな言葉をSupabaseへ新規保存する
function queueFavoriteQuoteInsert(quote) {
  favoriteQuotesCrud.insert(favoriteQuoteToSupabaseRow(quote));
}

// 指定した好きな言葉の変更をSupabaseへ反映する
function queueFavoriteQuoteUpdate(quote) {
  favoriteQuotesCrud.update(quote.id, favoriteQuoteToSupabaseRow(quote));
}

// 指定した好きな言葉をSupabaseから削除する
function queueFavoriteQuoteDelete(quoteId) {
  favoriteQuotesCrud.remove(quoteId);
}

// ---------- 起動時の読み込み・旧データからの移行 ----------

// ログイン直後に1回だけ呼ぶ：Supabaseのfavorite_quotesテーブルから一覧を読み込んでキャッシュする。
// まだ1件も無ければ（このアカウントでこの機能を初めて使う）、ローカルに残っている旧データ
//（reading-app-favorite-quotes。他の端末で使っていた分はapp_dataテーブルにあるかもしれないので、
// そちらも確認する）があればSupabaseへ移行する
async function initializeFavoriteQuotesFromCloud(userId) {
  const { data: rows, error } = await window.sb
    .from("favorite_quotes")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("好きな言葉の読み込みに失敗しました：", error);
    cachedFavoriteQuotes = [];
    return;
  }

  if (rows.length === 0) {
    const migrationSucceeded = await migrateLegacyFavoriteQuotesToCloud(userId);
    if (!migrationSucceeded) {
      // 失敗した分があれば、次回ログイン時にもう一度試せるよう旧データは消さずに残す
      return;
    }
  } else {
    cachedFavoriteQuotes = rows.map(supabaseRowToFavoriteQuote);
  }

  localStorage.removeItem(LEGACY_FAVORITE_QUOTES_KEY);
}

// このブラウザのlocalStorage、無ければ以前の同期先だったapp_dataテーブルから、
// 旧形式の好きな言葉一覧（reading-app-favorite-quotes）を探す
async function findLegacyFavoriteQuotes(userId) {
  const localRaw = localStorage.getItem(LEGACY_FAVORITE_QUOTES_KEY);
  if (localRaw) {
    try {
      return JSON.parse(localRaw);
    } catch (e) {
      // 壊れていれば、下のapp_data側の確認へ進む
    }
  }

  const { data, error } = await window.sb
    .from("app_data")
    .select("data_value")
    .eq("user_id", userId)
    .eq("data_key", LEGACY_FAVORITE_QUOTES_KEY)
    .maybeSingle();

  if (error || !data) {
    return [];
  }
  return data.data_value || [];
}

// 旧データ（reading-app-favorite-quotes）をSupabaseのfavorite_quotesテーブルへ移行する。
// bookIdは、本棚のSupabase移行（js/models/booksModel.js）のときにすでに新しいidへ書き換え済みのため、
// ここではそのまま使える。
// 戻り値：すべて移行できればtrue。1件でも失敗すればfalse
// （呼び出し元は、falseのときは旧データを消さずに残す＝次回ログイン時にもう一度試せるようにする）
async function migrateLegacyFavoriteQuotesToCloud(userId) {
  const legacyQuotes = await findLegacyFavoriteQuotes(userId);
  if (legacyQuotes.length === 0) {
    cachedFavoriteQuotes = [];
    return true;
  }

  const migrated = legacyQuotes.map(function (legacy) {
    return normalizeFavoriteQuote({
      id: generateFavoriteQuoteId(),
      bookId: legacy.bookId || null,
      text: legacy.text,
      category: legacy.category,
      createdAt: legacy.createdAt || Date.now()
    });
  });

  let hasError = false;
  for (const quote of migrated) {
    const { error } = await window.sb.from("favorite_quotes").insert(favoriteQuoteToSupabaseRow(quote));
    if (error) {
      console.error("好きな言葉の移行に失敗しました：", quote.text, error);
      hasError = true;
    }
  }

  cachedFavoriteQuotes = migrated;
  return !hasError;
}
