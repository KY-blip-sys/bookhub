// ---------- モーダルの共通の開閉挙動 ----------
// 「背景をクリックしたら閉じる」「Escapeキーで閉じる」は、追加系のモーダル（本・実践・好きな言葉の追加、
// 実績の詳細、読了カード、使い方など）でそれぞれ同じ処理を書いていたため、ここに1つにまとめておく。
// 各画面は、モーダルの背景要素と「閉じる関数」を渡すだけでよい。

function bindModalDismissal(overlayElement, closeFn) {
  // モーダルの背景（カードの外側）をクリックしたら閉じる
  overlayElement.addEventListener("click", function (event) {
    if (event.target === overlayElement) {
      closeFn();
    }
  });

  // Escapeキーでも閉じられるようにする
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && !overlayElement.hidden) {
      closeFn();
    }
  });
}

// ---------- クリックだけの一覧行をキーボードでも操作できるようにする ----------
// <li>や<div>にクリックだけを付けた「カード風の行」は、一覧画面のあちこちで同じ形で使われているが、
// クリックしか付けないとキーボード操作・スクリーンリーダー利用者が選べないため、
// role="button"・tabindex・Enter/Spaceキーでの操作をここでまとめて付与する。
function makeRowClickable(element, handler) {
  element.setAttribute("role", "button");
  element.tabIndex = 0;
  element.addEventListener("click", handler);
  element.addEventListener("keydown", function (event) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault(); // Spaceキーでページがスクロールしてしまうのを防ぐ
      handler(event);
    }
  });
}
