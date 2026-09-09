// ---------- ダークモードの設定 ----------

const DARK_MODE_KEY = "reading-app-dark-mode";

// ダークモードが選ばれているかどうかをlocalStorageから読み込む
function loadDarkModePreference() {
  return localStorage.getItem(DARK_MODE_KEY) === "true";
}

// ダークモードの設定をlocalStorageに保存する
function saveDarkModePreference(isDarkMode) {
  localStorage.setItem(DARK_MODE_KEY, isDarkMode);
  queueCloudSync(DARK_MODE_KEY, isDarkMode); // ログイン中なら、Supabaseにも保存する（js/services/cloudSync.js）
}
