// ---------- 使い方モーダル ----------

// 使い方ボタンは、スマホのトップバー（.mobile-topbar-help-button）とPCのサイドバー
// （.sidebar-help-button）の2箇所にあり、どちらも常時固定表示のヘッダー内に置くため
// 別々の要素になっている。同じ.header-help-buttonクラスで両方まとめて拾う
const helpButtons = document.querySelectorAll(".header-help-button");
const helpModal = document.getElementById("help-modal");
const helpCloseButton = document.getElementById("help-close-button");
const helpDoneButton = document.getElementById("help-done-button");

// 使い方モーダルを開く
function openHelpModal() {
  helpModal.hidden = false;
}

// 使い方モーダルを閉じる
function closeHelpModal() {
  helpModal.hidden = true;
}

helpButtons.forEach(function (button) {
  button.addEventListener("click", openHelpModal);
});
helpCloseButton.addEventListener("click", closeHelpModal);
helpDoneButton.addEventListener("click", closeHelpModal);
bindModalDismissal(helpModal, closeHelpModal);
