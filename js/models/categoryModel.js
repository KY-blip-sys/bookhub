// ---------- アクティブなカテゴリ（実用書 / 小説） ----------

const ACTIVE_CATEGORY_KEY = "reading-app-active-category";

// 今選ばれているカテゴリを読み込む（まだ選ばれていなければnull）
function loadActiveCategory() {
  return localStorage.getItem(ACTIVE_CATEGORY_KEY);
}

// 選んだカテゴリを保存する
function saveActiveCategory(category) {
  localStorage.setItem(ACTIVE_CATEGORY_KEY, category);
  queueCloudSync(ACTIVE_CATEGORY_KEY, category); // ログイン中なら、Supabaseにも保存する（js/services/cloudSync.js）
}
