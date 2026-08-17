// ---------- 使い方モーダル ----------

const helpButton = document.getElementById("header-help-button");
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

helpButton.addEventListener("click", openHelpModal);
helpCloseButton.addEventListener("click", closeHelpModal);
helpDoneButton.addEventListener("click", closeHelpModal);
bindModalDismissal(helpModal, closeHelpModal);
