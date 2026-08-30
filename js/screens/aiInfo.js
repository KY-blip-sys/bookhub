// ---------- AI機能について・AIクレジットの説明モーダル ----------
// help.js（使い方モーダル）と同じ開閉パターン。プラン・ログイン状況に関わらず、
// AI画面の先頭にあるボタンから誰でも開ける（アップグレードを検討する材料にもなるため）。

const aiInfoOpenButton = document.getElementById("ai-info-open-button");
const aiInfoModal = document.getElementById("ai-info-modal");
const aiInfoCloseButton = document.getElementById("ai-info-close-button");
const aiInfoDoneButton = document.getElementById("ai-info-done-button");

function openAiInfoModal() {
  aiInfoModal.hidden = false;
}

function closeAiInfoModal() {
  aiInfoModal.hidden = true;
}

aiInfoOpenButton.addEventListener("click", openAiInfoModal);
aiInfoCloseButton.addEventListener("click", closeAiInfoModal);
aiInfoDoneButton.addEventListener("click", closeAiInfoModal);
bindModalDismissal(aiInfoModal, closeAiInfoModal);
