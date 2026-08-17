// ---------- レビューのデータ ----------
// 本オブジェクトに入れ子にせず、独立したコレクションとして保存する。
// こうしておくと、将来Supabase/Firebaseの「reviewsテーブル」に移行するときも、
// この配列の1件がそのままテーブルの1行に対応するので移行しやすい。
//
// 保存する項目：id / bookId / category / userId / rating / body / containsSpoiler / createdAt
// userIdは、将来のユーザーアカウント機能に備えたプレースホルダ（今は固定値）。
// 「いいね」「コメント」などのSNS機能は、実装するときにreviewIdを参照する
// 別コレクション（例：reading-app-review-likes）として追加する想定で、
// レビュー自体にはまだ持たせない（使わないフィールドを先に生やさない）。

const REVIEWS_KEY = "reading-app-reviews";
const LOCAL_USER_ID = "local-user"; // 将来のユーザー機能ができるまでの固定id

function loadReviews() {
  return loadJSON(REVIEWS_KEY, []);
}

function saveReviews(reviews) {
  saveJSON(REVIEWS_KEY, reviews);
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
      id: Date.now(),
      bookId: bookId,
      category: category,
      userId: LOCAL_USER_ID,
      rating: data.rating,
      body: data.body,
      containsSpoiler: data.containsSpoiler,
      createdAt: Date.now()
    });
  }

  saveReviews(reviews);
}
