// ---------- 設定画面 ----------

// 「保存しました」の案内を表示し、数秒後に自動で消す（連続で保存したときは前のタイマーをリセットする）
function flashSavedNote(noteEl) {
  clearTimeout(noteEl._hideTimer);
  noteEl.hidden = false;
  noteEl._hideTimer = setTimeout(function () {
    noteEl.hidden = true;
  }, 2200);
}

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

  flashSavedNote(dailyGoalMinutesSavedNote);
  renderReadingRing(); // サイドバーのリングにも、変更をすぐ反映する
});
