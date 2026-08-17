// ---------- ダークモードの設定 ----------

const DARK_MODE_KEY = "reading-app-dark-mode";

// ダークモードが選ばれているかどうかをlocalStorageから読み込む
function loadDarkModePreference() {
  return localStorage.getItem(DARK_MODE_KEY) === "true";
}

// ダークモードの設定をlocalStorageに保存する
function saveDarkModePreference(isDarkMode) {
  localStorage.setItem(DARK_MODE_KEY, isDarkMode);
}

// ---------- Google Books APIキー ----------

const GOOGLE_BOOKS_API_KEY_STORAGE_KEY = "reading-app-google-books-api-key";

// 保存されているGoogle Books APIキーを読み込む（未設定なら空文字）
function loadGoogleBooksApiKey() {
  return localStorage.getItem(GOOGLE_BOOKS_API_KEY_STORAGE_KEY) || "";
}

// Google Books APIキーをlocalStorageに保存する
function saveGoogleBooksApiKey(apiKey) {
  localStorage.setItem(GOOGLE_BOOKS_API_KEY_STORAGE_KEY, apiKey);
}

// ---------- OpenAI APIキー（AI読書コーチ用） ----------

const OPENAI_API_KEY_STORAGE_KEY = "reading-app-openai-api-key";

// 保存されているOpenAI APIキーを読み込む（未設定なら空文字）
function loadOpenAiApiKey() {
  return localStorage.getItem(OPENAI_API_KEY_STORAGE_KEY) || "";
}

// OpenAI APIキーをlocalStorageに保存する
function saveOpenAiApiKey(apiKey) {
  localStorage.setItem(OPENAI_API_KEY_STORAGE_KEY, apiKey);
}

// ---------- 今月の読書目標（AI読書アシスタント用） ----------

const MONTHLY_READING_GOAL_KEY = "reading-app-monthly-goal";

// 設定されている今月の目標冊数を読み込む（未設定・0なら0を返す＝目標なしとして扱う）
function loadMonthlyReadingGoal() {
  return Number(localStorage.getItem(MONTHLY_READING_GOAL_KEY)) || 0;
}

// 今月の目標冊数をlocalStorageに保存する
function saveMonthlyReadingGoal(goalCount) {
  localStorage.setItem(MONTHLY_READING_GOAL_KEY, String(goalCount));
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
}
