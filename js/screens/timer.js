// タイマーの状態を管理する変数
let timerTotalSeconds = 25 * 60; // 選択中の時間（秒に変換したもの）
let timerRemainingSeconds = timerTotalSeconds; // 残り秒数
let timerIntervalId = null; // 動作中のsetIntervalのID（止めるときに必要）

// 読書記録として保存する秒数（タイマーが最後まで終わったときは選択中の時間、
// 途中でリセットして保存したときはそのときまでの経過時間が入る）
let timerElapsedSecondsForRecord = 0;

// タイマー関連の要素を取得しておく
const timerDisplay = document.getElementById("timer-display");
// スタート/ストップは1つのボタンをトグルにして、日本語のラベルだけ差し替える
const timerToggleButton = document.getElementById("timer-toggle-button");
const timerResetButton = document.getElementById("timer-reset-button");
const timerRingFill = document.getElementById("timer-ring-fill");

// ---------- リングの中で「時間・分」をスクロールして選ぶピッカー（Apple純正タイマーと同じ考え方） ----------
// 列そのものはjs/screens/scrollDatePicker.jsのbuildScrollDateColumnを流用し、CSSだけリング内に収まる小ささにしてある
const timerPicker = document.getElementById("timer-picker");
const timerPickerHourCol = buildScrollDateColumn(document.getElementById("timer-picker-hour-col"), 28);
const timerPickerMinuteCol = buildScrollDateColumn(document.getElementById("timer-picker-minute-col"), 28);

const TIMER_PICKER_HOURS = [];
for (let h = 0; h <= 23; h++) {
  TIMER_PICKER_HOURS.push(h);
}
const TIMER_PICKER_MINUTES = [];
for (let m = 0; m <= 59; m++) {
  TIMER_PICKER_MINUTES.push(m);
}

// ピッカーの列が動くたびに、選ばれている時間・分をそのままタイマーの時間として反映する
function applyTimerPickerSelection() {
  const hours = timerPickerHourCol.getValue();
  const minutes = timerPickerMinuteCol.getValue();
  timerTotalSeconds = (hours * 60 + minutes) * 60;
  timerRemainingSeconds = timerTotalSeconds;
  updateTimerDisplay();
  updateTimerToggleButton();
}

timerPickerHourCol.setOnChange(applyTimerPickerSelection);
timerPickerMinuteCol.setOnChange(applyTimerPickerSelection);

// 作動中は#timer-sectionに.timer-runningを付け、時間選択ボタンをその場で隠してリングを目立たせる
// （以前は画面全体を覆うモーダルへ移動させていたが、他の操作を一切できなくしてしまうため、
// Apple純正タイマーのようにその場で切り替える方式に変更した）
const timerSection = document.getElementById("timer-section");

// SVGのcircleの半径（index.htmlのr属性と合わせる。進捗リング・サイドバーのリングと同じ考え方）から、リング1周ぶんの長さを求めておく
const TIMER_RING_RADIUS = 42;
const TIMER_RING_CIRCUMFERENCE = 2 * Math.PI * TIMER_RING_RADIUS;
timerRingFill.style.strokeDasharray = TIMER_RING_CIRCUMFERENCE;

// 途中リセット時の確認モーダルに使う要素を取得しておく
const timerResetModal = document.getElementById("timer-reset-modal");
const timerResetElapsedTimeEl = document.getElementById("timer-reset-elapsed-time");
const timerResetSaveButton = document.getElementById("timer-reset-save-button");
const timerResetDiscardButton = document.getElementById("timer-reset-discard-button");
const timerResetCancelButton = document.getElementById("timer-reset-cancel-button");

// 確認モーダルを開いている間、リセット前の状態を覚えておくための変数
let timerResetWasRunning = false; // リセットボタンを押した時点で、タイマーが動いていたか
let timerResetElapsedSeconds = 0; // リセットボタンを押した時点までの経過秒数

// 残り秒数を「25:00」（1時間未満）または「1:05:00」（1時間以上）のような表示と、
// 円形リングの両方に反映する（リングの塗り具合＝残り時間の割合。時間が経つほど、円周に沿って塗りが減っていく）
function updateTimerDisplay() {
  const hours = Math.floor(timerRemainingSeconds / 3600);
  const minutes = Math.floor((timerRemainingSeconds % 3600) / 60);
  const seconds = timerRemainingSeconds % 60;

  // 1時間未満は今まで通り「分:秒」、1時間以上になったら「時:分:秒」で表示する
  // （時間ピッカーを追加したことで、1時間を超える長さも選べるようになったため）
  timerDisplay.textContent = hours > 0
    ? hours + ":" + String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0")
    : String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0");
  timerDisplay.classList.toggle("timer-display-long", hours > 0); // 桁が増える分、少しだけ文字を小さくする

  const remainingRatio = timerTotalSeconds > 0 ? timerRemainingSeconds / timerTotalSeconds : 0;
  timerRingFill.style.strokeDashoffset = TIMER_RING_CIRCUMFERENCE * (1 - remainingRatio);

  updateTimerLayout();
}

// 作動中、または一時停止中でもまだ経過時間が残っているときはカウントダウン表示を、
// それ以外（これから選ぶ・リセット直後）はリングの中のピッカーを見せる
function updateTimerLayout() {
  const showCountdown = timerIntervalId !== null || timerTotalSeconds - timerRemainingSeconds > 0;
  timerPicker.hidden = showCountdown;
  timerDisplay.hidden = !showCountdown;
}

// スタート/ストップボタンのラベルを、動作中かどうかに合わせて切り替える。
// 0分のまま（ピッカーで時間を選んでいない）だと、うっかり開始できないようボタンを無効にする
function updateTimerToggleButton() {
  const isRunning = timerIntervalId !== null;
  timerToggleButton.textContent = isRunning ? "ストップ" : "スタート";
  timerToggleButton.disabled = !isRunning && timerTotalSeconds <= 0;
}

// 動作中だけ、時間選択ボタンをその場で隠し、リングを少し大きく見せる
// （Apple純正タイマーのように、ピッカー→カウントダウンをその場で切り替える。他の操作は塞がない）
function showRunningTimerLayout() {
  timerSection.classList.add("timer-running");
}

// 止まったら、時間選択ボタンをもとに戻す
function showIdleTimerLayout() {
  timerSection.classList.remove("timer-running");
}

// 動いているタイマーを止める（内部処理）
function stopTimerInterval() {
  if (timerIntervalId !== null) {
    clearInterval(timerIntervalId);
    timerIntervalId = null;
  }
  showIdleTimerLayout(); // 止まったタイミングで、リングの大きさを必ずアイドル状態に戻す
  updateTimerLayout(); // ピッカー／カウントダウンの表示もあわせて最新の状態にする
}

// 本を開いたときなど、タイマーの時間をまとめて設定する（ピッカーの選択位置も合わせて動かす）
function setTimerDuration(minutes) {
  stopTimerInterval();
  timerTotalSeconds = minutes * 60;
  timerRemainingSeconds = timerTotalSeconds;

  timerPickerHourCol.setItems(TIMER_PICKER_HOURS, Math.floor(minutes / 60));
  timerPickerMinuteCol.setItems(TIMER_PICKER_MINUTES, minutes % 60);

  updateTimerDisplay();
  updateTimerToggleButton();
}

// ---------- タイマー終了時の通知音 ----------
// ブラウザは、ユーザー操作を伴わない自動再生された音声をブロックすることがある。
// タイマー終了はsetIntervalの中（＝ユーザー操作ではないタイミング）で起きるため、
// AudioContextは「スタート」ボタンを押した瞬間（＝確実なユーザー操作）にあらかじめ用意・再開しておき、
// 終了時はすでに動いているcontextで鳴らすだけにすることで、確実に再生されるようにする
let timerAudioContext = null;

function ensureTimerAudioContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    return null;
  }
  if (!timerAudioContext) {
    timerAudioContext = new AudioContextClass();
  }
  if (timerAudioContext.state === "suspended") {
    timerAudioContext.resume();
  }
  return timerAudioContext;
}

// 「ピッ、ピッ、ピッ」と短い電子音を3回鳴らす（音量は控えめにしてある）
function playTimerFinishedSound() {
  const context = ensureTimerAudioContext();
  if (!context) {
    return;
  }

  [0, 0.35, 0.7].forEach(function (startOffset) {
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 880;

    const startTime = context.currentTime + startOffset;
    const endTime = startTime + 0.25;

    // 音量をなめらかに上げ下げし、耳障りな「プツッ」というノイズを防ぐ
    gainNode.gain.setValueAtTime(0, startTime);
    gainNode.gain.linearRampToValueAtTime(0.2, startTime + 0.02);
    gainNode.gain.linearRampToValueAtTime(0, endTime);

    oscillator.connect(gainNode);
    gainNode.connect(context.destination);
    oscillator.start(startTime);
    oscillator.stop(endTime);
  });
}

// タイマーをスタートする
function startTimer() {
  if (timerIntervalId !== null || timerTotalSeconds <= 0) {
    return; // すでに動いている、または時間が選ばれていない場合は何もしない
  }

  timerFirstTimeHint.hidden = true; // 読み始めたら「まずはスタートを押しましょう」のヒントは不要になる

  ensureTimerAudioContext(); // 終了時に確実に音が鳴るよう、今のユーザー操作のタイミングで準備しておく

  // 通知の許可をまだ聞いていなければ、ここで確認する
  if (typeof Notification !== "undefined" && Notification.permission === "default") {
    Notification.requestPermission();
  }

  timerIntervalId = setInterval(function () {
    timerRemainingSeconds--;
    updateTimerDisplay();

    if (timerRemainingSeconds <= 0) {
      stopTimerInterval();
      updateTimerToggleButton();
      notifyTimerFinished();
    }
  }, 1000);

  updateTimerToggleButton();
  showRunningTimerLayout(); // 動き出したら、リングを少し大きく見せる
  updateTimerLayout(); // 最初のカウントダウンを待たずに、その場でピッカーからカウントダウン表示へ切り替える
}

// タイマーを一時停止する
function pauseTimer() {
  stopTimerInterval();
  updateTimerToggleButton();
}

// タイマーを、選択中の時間にリセットする
function resetTimer() {
  stopTimerInterval();
  updateTimerToggleButton();
  timerRemainingSeconds = timerTotalSeconds;
  updateTimerDisplay();
}

// タイマー終了を知らせる
function notifyTimerFinished() {
  playTimerFinishedSound();

  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    new Notification("読書タイマー終了", { body: "お疲れさまでした！" });
  } else {
    alert("タイマーが終了しました。お疲れさまでした！");
  }

  timerElapsedSecondsForRecord = timerTotalSeconds; // 最後まで読み終えたので、選択していた時間まるごとを記録する

  // タイマーが最後まで進んだままだと「経過時間あり」の状態が残り続け、記録を保存したあとに
  // 他の画面へ移動しようとしても「読書を終了しますか？」の確認が誤って再び出てしまうため、
  // ここで時間の追跡をリセットしておく（リセットボタンから保存する場合と同じ扱いに揃える）
  resetTimer();

  showRecordForm(); // 終了したら、記録の入力フォームを表示する
}

// 秒数を「23分15秒」のような表示に変換する
function formatElapsedTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return minutes + "分" + remainingSeconds + "秒";
}

// タイマーが作動中（一時停止中でも、まだ保存していない経過時間があれば）に、ページ移動など
// 別のことをしようとしたら、リセット時と同じ「保存する／保存しない／キャンセル」の確認を挟む。
// 経過時間が無ければ、何も失われないので確認せずそのまま進む（app.jsの画面遷移から呼ばれる）。
// onProceed は「保存しない」を選んだとき、または確認が不要だったときだけ呼ばれる
// （「保存する」を選んだ場合は、この場で記録フォームを開くため、元の移動先には進まない）
let pendingLeaveProceedCallback = null;

function confirmLeaveWhileTimerRunning(onProceed) {
  const elapsedSeconds = timerTotalSeconds - timerRemainingSeconds;

  if (elapsedSeconds <= 0) {
    stopTimerInterval(); // 何も読んでいなければ、動いていた場合も片付けてそのまま進む
    updateTimerToggleButton();
    onProceed();
    return;
  }

  timerResetWasRunning = timerIntervalId !== null;
  stopTimerInterval(); // 確認中は時間が進まないよう、一時停止しておく
  updateTimerToggleButton();
  timerResetElapsedSeconds = elapsedSeconds;
  pendingLeaveProceedCallback = onProceed;

  timerResetElapsedTimeEl.textContent = formatElapsedTime(elapsedSeconds);
  timerResetModal.hidden = false;
}

// タブを閉じる・更新する・別のサイトへ移動するなど、ブラウザレベルでページを離れようとしたときの確認
// （まだ保存していない経過時間があるときだけ、ブラウザ標準の確認ダイアログを出す）
window.addEventListener("beforeunload", function (event) {
  if (timerTotalSeconds - timerRemainingSeconds > 0) {
    event.preventDefault();
    event.returnValue = "";
  }
});

// スタート/ストップは同じボタン。動いていなければ始め、動いていれば止める
timerToggleButton.addEventListener("click", function () {
  if (timerIntervalId !== null) {
    pauseTimer();
  } else {
    startTimer();
  }
});

// 「リセット」ボタンの処理：confirmLeaveWhileTimerRunningと全く同じ確認を使う。
// 移動先が無いだけなので、onProceedでは（確認が不要だった場合に備えて）リセットするだけでよい
timerResetButton.addEventListener("click", function () {
  confirmLeaveWhileTimerRunning(function () {
    resetTimer();
  });
});

// 「保存する」：これまでの経過時間を読書記録として保存するため、記録フォームを開く
// （移動しようとして開いた確認だった場合も、記録を先に保存してもらうため、元の移動は行わない）
timerResetSaveButton.addEventListener("click", function () {
  timerResetModal.hidden = true;
  timerElapsedSecondsForRecord = timerResetElapsedSeconds;
  pendingLeaveProceedCallback = null;
  resetTimer();
  showRecordForm();
});

// 「保存しない」：記録を残さずタイマーをリセットし、移動しようとしていた場合はそのまま移動する
timerResetDiscardButton.addEventListener("click", function () {
  timerResetModal.hidden = true;
  resetTimer();

  const proceed = pendingLeaveProceedCallback;
  pendingLeaveProceedCallback = null;
  if (proceed) {
    proceed();
  }
});

// 「キャンセル」：やめて、元の状態に戻す（移動もしない）
timerResetCancelButton.addEventListener("click", function () {
  timerResetModal.hidden = true;
  pendingLeaveProceedCallback = null;
  if (timerResetWasRunning) {
    startTimer(); // 確認前に動いていた場合は、タイマーを再開する
  }
});

// 最初の表示を整える（ピッカーの項目も、この時点で25分の位置に組み立てておく）
setTimerDuration(25);
