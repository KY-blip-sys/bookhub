// ---------- レビューのデータ（Supabaseのreviewsテーブルへの保存・読み込み） ----------
// 本オブジェクトに入れ子にせず、独立したコレクションとして保存する（この考え方は変わらない）。
//
// loadReviews()・saveReviews()は、他の画面から見れば以前と同じ「同期的な関数」のまま使えるように、
// メモリ上のキャッシュ（cachedReviews）を介してSupabaseとやり取りする：
// ・loadReviews()は、キャッシュの複製を返す（呼び出し側が中身を直接書き換えても、
//   キャッシュ自体は変わらないようにするため）
// ・saveReviews(reviews)は、渡された配列をキャッシュ（＝直前の状態）と見比べて、
//   追加・変更・削除された分だけをSupabaseのreviewsテーブルへ反映する（結果を待たない「投げっぱなし」）

const LEGACY_REVIEWS_KEY = "reading-app-reviews"; // 移行前の旧データ（ローカル）

let cachedReviews = [];

function cloneReview(review) {
  return JSON.parse(JSON.stringify(review));
}

function loadReviews() {
  return cachedReviews.map(cloneReview);
}

function saveReviews(reviews) {
  const previousById = {};
  cachedReviews.forEach(function (review) {
    previousById[review.id] = review;
  });

  const nextIds = {};
  reviews.forEach(function (review) {
    nextIds[review.id] = true;

    const previous = previousById[review.id];
    if (!previous) {
      queueReviewInsert(review);
    } else if (reviewSnapshot(previous) !== reviewSnapshot(review)) {
      queueReviewUpdate(review);
    }
  });

  Object.keys(previousById).forEach(function (id) {
    if (!nextIds[id]) {
      queueReviewDelete(previousById[id].id);
    }
  });

  cachedReviews = reviews;
}

// 指定した本のレビューを1件取得する（無ければnull）
function getReviewForBook(bookId) {
  const reviews = loadReviews();
  const review = reviews.find(function (r) {
    return r.bookId === bookId;
  });
  return review || null;
}

// レビューを保存する（同じ本のレビューが既にあれば上書き編集、無ければ新規追加）
function saveReview(bookId, category, data) {
  const reviews = loadReviews();
  const existing = reviews.find(function (review) {
    return review.bookId === bookId;
  });

  if (existing) {
    existing.rating = data.rating;
    existing.body = data.body;
    existing.containsSpoiler = data.containsSpoiler;
  } else {
    reviews.push({
      id: generateReviewId(),
      bookId: bookId,
      category: category,
      rating: data.rating,
      body: data.body,
      containsSpoiler: data.containsSpoiler,
      createdAt: Date.now()
    });
  }

  saveReviews(reviews);
}

// ---------- Supabaseとの変換・読み書き ----------

// 新しいレビューのidを発行する（Supabaseのreviews.idがuuid型のため）
function generateReviewId() {
  return crypto.randomUUID();
}

// 中身を比べるためのスナップショット（idを除く。中身が同じならSupabaseへの更新を発生させない）
function reviewSnapshot(review) {
  return JSON.stringify({
    bookId: review.bookId,
    category: review.category,
    rating: review.rating,
    body: review.body || "",
    containsSpoiler: !!review.containsSpoiler,
    createdAt: review.createdAt || 0
  });
}

// アプリ内で使うレビューの形 → Supabaseのreviews行の形
function reviewToSupabaseRow(review) {
  return {
    id: review.id,
    user_id: currentUserId, // js/services/cloudSync.js（ログイン中ユーザーのauth.uid()）
    book_id: review.bookId,
    category: review.category,
    rating: review.rating,
    body: review.body || null,
    contains_spoiler: !!review.containsSpoiler,
    created_at: review.createdAt ? new Date(review.createdAt).toISOString() : new Date().toISOString()
  };
}

// Supabaseのreviews行 → アプリ内で使うレビューの形
function supabaseRowToReview(row) {
  return {
    id: row.id,
    bookId: row.book_id,
    category: row.category,
    rating: row.rating,
    body: row.body || "",
    containsSpoiler: !!row.contains_spoiler,
    createdAt: new Date(row.created_at).getTime()
  };
}

// js/services/cloudSync.jsの共通CRUD（ログイン確認・投げっぱなし送信・エラーログを1箇所にまとめたもの）
const reviewsCrud = createCloudCrud("reviews", "レビュー");

// 指定したレビューをSupabaseへ新規保存する
function queueReviewInsert(review) {
  reviewsCrud.insert(reviewToSupabaseRow(review));
}

// 指定したレビューの変更をSupabaseへ反映する
function queueReviewUpdate(review) {
  reviewsCrud.update(review.id, reviewToSupabaseRow(review));
}

// 指定したレビューをSupabaseから削除する
function queueReviewDelete(reviewId) {
  reviewsCrud.remove(reviewId);
}

// ---------- 起動時の読み込み・旧データからの移行 ----------

// ログイン直後に1回だけ呼ぶ：Supabaseのreviewsテーブルからレビュー一覧を読み込んでキャッシュする。
// まだ1件も無ければ（このアカウントでこの機能を初めて使う）、ローカルに残っている旧データ
//（reading-app-reviews。他の端末で使っていた分はapp_dataテーブルにあるかもしれないので、
// そちらも確認する）があればSupabaseへ移行する
async function initializeReviewsFromCloud(userId) {
  const { data: rows, error } = await window.sb
    .from("reviews")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("レビューの読み込みに失敗しました：", error);
    cachedReviews = [];
    return;
  }

  if (rows.length === 0) {
    const migrationSucceeded = await migrateLegacyReviewsToCloud(userId);
    if (!migrationSucceeded) {
      // 失敗した分があれば、次回ログイン時にもう一度試せるよう旧データは消さずに残す
      return;
    }
  } else {
    cachedReviews = rows.map(supabaseRowToReview);
  }

  localStorage.removeItem(LEGACY_REVIEWS_KEY);
}

// このブラウザのlocalStorage、無ければ以前の同期先だったapp_dataテーブルから、
// 旧形式のレビュー一覧（reading-app-reviews）を探す
async function findLegacyReviews(userId) {
  const localRaw = localStorage.getItem(LEGACY_REVIEWS_KEY);
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
    .eq("data_key", LEGACY_REVIEWS_KEY)
    .maybeSingle();

  if (error || !data) {
    return [];
  }
  return data.data_value || [];
}

// 旧データ（reading-app-reviews）をSupabaseのreviewsテーブルへ移行する。
// bookIdは、本棚のSupabase移行（js/models/booksModel.js）のときにすでに新しいidへ書き換え済みのため、
// ここではそのまま使える。
// 戻り値：すべて移行できればtrue。1件でも失敗すればfalse
// （呼び出し元は、falseのときは旧データを消さずに残す＝次回ログイン時にもう一度試せるようにする）
async function migrateLegacyReviewsToCloud(userId) {
  const legacyReviews = await findLegacyReviews(userId);
  if (legacyReviews.length === 0) {
    cachedReviews = [];
    return true;
  }

  const migrated = legacyReviews.map(function (legacy) {
    return {
      id: generateReviewId(),
      bookId: legacy.bookId,
      category: legacy.category,
      rating: legacy.rating,
      body: legacy.body || "",
      containsSpoiler: !!legacy.containsSpoiler,
      createdAt: legacy.createdAt || Date.now()
    };
  });

  let hasError = false;
  for (const review of migrated) {
    const { error } = await window.sb.from("reviews").insert(reviewToSupabaseRow(review));
    if (error) {
      console.error("レビューの移行に失敗しました：", review.bookId, error);
      hasError = true;
    }
  }

  cachedReviews = migrated;
  return !hasError;
}
