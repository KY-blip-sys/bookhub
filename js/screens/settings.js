// ---------- 設定画面 ----------

const googleBooksApiKeyInput = document.getElementById("google-books-api-key-input");
const saveApiKeyButton = document.getElementById("save-api-key-button");
const apiKeySavedNote = document.getElementById("api-key-saved-note");

// 画面を開いたときのために、保存済みのAPIキーを入力欄にあらかじめ入れておく
googleBooksApiKeyInput.value = loadGoogleBooksApiKey();

// 「保存」ボタンが押されたときの処理
saveApiKeyButton.addEventListener("click", function () {
  saveGoogleBooksApiKey(googleBooksApiKeyInput.value.trim());

  apiKeySavedNote.hidden = false;
});

// ---------- OpenAI APIキー（AI読書コーチ用） ----------

const openaiApiKeyInput = document.getElementById("openai-api-key-input");
const saveOpenaiApiKeyButton = document.getElementById("save-openai-api-key-button");
const openaiApiKeySavedNote = document.getElementById("openai-api-key-saved-note");

// 画面を開いたときのために、保存済みのAPIキーを入力欄にあらかじめ入れておく
openaiApiKeyInput.value = loadOpenAiApiKey();

// 「保存」ボタンが押されたときの処理
saveOpenaiApiKeyButton.addEventListener("click", function () {
  saveOpenAiApiKey(openaiApiKeyInput.value.trim());

  openaiApiKeySavedNote.hidden = false;
});

// ---------- 今月の読書目標（AI読書アシスタント用） ----------

const monthlyGoalInput = document.getElementById("monthly-goal-input");
const saveMonthlyGoalButton = document.getElementById("save-monthly-goal-button");
const monthlyGoalSavedNote = document.getElementById("monthly-goal-saved-note");
enableFlexibleDigitInput(monthlyGoalInput); // 全角数字で入力しても半角として扱う

// 画面を開いたときのために、保存済みの目標冊数を入力欄にあらかじめ入れておく（0冊なら未設定として空欄にする）
const savedMonthlyGoal = loadMonthlyReadingGoal();
monthlyGoalInput.value = savedMonthlyGoal ? String(savedMonthlyGoal) : "";

// 「保存」ボタンが押されたときの処理
saveMonthlyGoalButton.addEventListener("click", function () {
  saveMonthlyReadingGoal(Number(monthlyGoalInput.value) || 0);

  monthlyGoalSavedNote.hidden = false;
});

// ---------- 1日の読書目標時間（サイドバーのリング表示用） ----------

const dailyGoalMinutesInput = document.getElementById("daily-goal-minutes-input");
const saveDailyGoalMinutesButton = document.getElementById("save-daily-goal-minutes-button");
const dailyGoalMinutesSavedNote = document.getElementById("daily-goal-minutes-saved-note");
enableFlexibleDigitInput(dailyGoalMinutesInput); // 全角数字で入力しても半角として扱う

// 画面を開いたときのために、保存済みの目標時間を入力欄にあらかじめ入れておく
dailyGoalMinutesInput.value = String(loadDailyReadingGoalMinutes());

// 「保存」ボタンが押されたときの処理
saveDailyGoalMinutesButton.addEventListener("click", function () {
  saveDailyReadingGoalMinutes(Number(dailyGoalMinutesInput.value) || DEFAULT_DAILY_READING_GOAL_MINUTES);

  dailyGoalMinutesSavedNote.hidden = false;
  renderReadingRing(); // サイドバーのリングにも、変更をすぐ反映する
});
