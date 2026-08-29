// ---------- AI画面のタブ切り替え（チャット／おすすめ本／クイズ／要約／学習コーチ） ----------
// 各タブの中身（生成・表示ロジック）はそれぞれ独立したファイルが担当する
// （aiChat.js / aiRecommend.js / aiQuiz.js / aiSummary.js / aiCoach.js）。
// このファイルはタブの見た目の切り替えだけを行い、js/screens/actions.jsの
// 「実践中／実績」タブ切り替えと同じ考え方にしている。

const AI_TAB_NAMES = ["chat", "recommend", "quiz", "summary", "coach"];

const aiTabButtons = document.querySelectorAll(".pill-tab[data-ai-tab]");

// 一度生成した結果（おすすめ本・クイズ・要約・学習コーチ）はタブを離れても消さず、
// 戻ってきたときにそのまま見られるようにする（切り替えるたびに再生成させない）
function showAiTab(tabName) {
  aiTabButtons.forEach(function (button) {
    button.classList.toggle("active", button.dataset.aiTab === tabName);
  });
  AI_TAB_NAMES.forEach(function (name) {
    document.getElementById("ai-" + name + "-panel").hidden = name !== tabName;
  });

  if (tabName === "chat") {
    prepareAiChatScreen(); // aiChat.js
  }
}

aiTabButtons.forEach(function (button) {
  button.addEventListener("click", function () {
    showAiTab(button.dataset.aiTab);
  });
});

// AI画面をサイドバーから開いたときの処理（js/screens/app.jsのgoToNavPageから呼ばれる）。
// 実践リストなど他のタブ付き画面と同じく、常に最初のタブ（チャット）から開き直す
function prepareAiScreen() {
  showAiTab("chat");
}
