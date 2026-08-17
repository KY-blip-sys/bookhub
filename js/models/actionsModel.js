// ---------- 実践（アクション）のデータ ----------

const ACTIONS_KEY = "reading-app-actions";

function loadActions() {
  return loadJSON(ACTIONS_KEY, []);
}

function saveActions(actions) {
  saveJSON(ACTIONS_KEY, actions);
}

// ---------- 実績（クリアした実践）のデータ ----------

const ACHIEVEMENTS_KEY = "reading-app-achievements";

function loadAchievements() {
  return loadJSON(ACHIEVEMENTS_KEY, []);
}

function saveAchievements(achievements) {
  saveJSON(ACHIEVEMENTS_KEY, achievements);
}

// ---------- 実践の状態にまつわる、純粋な計算 ----------

// やることリストのチェック状況から、ステータスを自動的に決める
function computeStatusFromTodos(todos) {
  if (!todos || todos.length === 0) {
    return "not-started";
  }

  const doneCount = todos.filter(function (todo) {
    return todo.done;
  }).length;

  if (doneCount === 0) {
    return "not-started"; // まだ1つもチェックしていない
  }
  if (doneCount === todos.length) {
    return "done"; // 全部チェックした
  }
  return "in-progress"; // 一部だけチェックした
}

// 実践・実績（どちらもbookIdを持つ配列）から、指定したカテゴリの本に紐づくものだけを返す
function filterItemsByBookCategory(items, books, category) {
  return items.filter(function (item) {
    const book = books.find(function (b) {
      return b.id === item.bookId;
    });
    return book && book.category === category;
  });
}

// 今アクティブなカテゴリの本に紐づく実践だけを返す（ダッシュボードや実践リストで使う）
function getActionsByActiveCategory() {
  return filterItemsByBookCategory(loadActions(), loadBooks(), loadActiveCategory());
}

// 今アクティブなカテゴリの本に紐づく実績だけを返す
function getAchievementsByActiveCategory() {
  return filterItemsByBookCategory(loadAchievements(), loadBooks(), loadActiveCategory());
}
