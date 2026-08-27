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

// ---------- 1日の読書目標時間（サイドバーのリング表示用） ----------

const DAILY_READING_GOAL_MINUTES_KEY = "reading-app-daily-goal-minutes";
const DEFAULT_DAILY_READING_GOAL_MINUTES = 30;

// 設定されている1日の目標時間（分）を読み込む（未設定なら既定値を返す）
function loadDailyReadingGoalMinutes() {
  const stored = Number(localStorage.getItem(DAILY_READING_GOAL_MINUTES_KEY));
  return stored > 0 ? stored : DEFAULT_DAILY_READING_GOAL_MINUTES;
}

// 1日の目標時間（分）をlocalStorageに保存する
function saveDailyReadingGoalMinutes(minutes) {
  localStorage.setItem(DAILY_READING_GOAL_MINUTES_KEY, String(minutes));
  queueCloudSync(DAILY_READING_GOAL_MINUTES_KEY, minutes); // ログイン中なら、Supabaseにも保存する（js/services/cloudSync.js）
}
