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
