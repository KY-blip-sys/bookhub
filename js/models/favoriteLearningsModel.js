// ---------- 学んだこと（読書記録とは別に、本の詳細画面から直接追加した分）のデータ ----------
// 読書記録の「今日学んだこと」は本を読んでいる最中にしか書けないが、
// こちらは本の詳細画面の「学んだこと」タブからいつでも自由に追加できる、独立したコレクション。
// favoriteQuotesModel.jsと同じ考え方・同じ形（id / bookId / text / createdAt）。
// 「学んだこと」は実用書だけの概念のため、bookIdは必須（本を選ばずに追加する入り口は無い）。

const FAVORITE_LEARNINGS_KEY = "reading-app-favorite-learnings";

function loadFavoriteLearnings() {
  return loadJSON(FAVORITE_LEARNINGS_KEY, []);
}

function saveFavoriteLearnings(learnings) {
  saveJSON(FAVORITE_LEARNINGS_KEY, learnings);
}

// 学んだことを1件追加する
function addFavoriteLearning(bookId, text) {
  const learnings = loadFavoriteLearnings();
  learnings.push({
    id: Date.now(),
    bookId: bookId,
    text: text,
    createdAt: Date.now()
  });
  saveFavoriteLearnings(learnings);
}

// 学んだことの本文を更新する
function updateFavoriteLearning(learningId, text) {
  const learnings = loadFavoriteLearnings();
  const learning = learnings.find(function (l) {
    return l.id === learningId;
  });
  if (!learning) {
    return;
  }
  learning.text = text;
  saveFavoriteLearnings(learnings);
}

// 学んだことを削除する
function deleteFavoriteLearning(learningId) {
  const learnings = loadFavoriteLearnings();
  const remaining = learnings.filter(function (l) {
    return l.id !== learningId;
  });
  saveFavoriteLearnings(remaining);
}
