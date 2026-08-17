// ---------- ★評価ピッカーの共通部品 ----------
// 「ホバーで光り、クリックで確定する」星5つの評価ボタンは、レビュー投稿と実践の振り返りで
// それぞれ同じコードを書いていたため、ここに1つにまとめておく。

// container: 星ボタンを入れる要素（.star-picker クラスを付けておく）
// initialRating: 最初に何個光らせておくか（0なら何も光っていない状態から始まる）
// onChange(rating): 星をクリックして評価が確定するたびに呼ばれる
function buildStarPicker(container, initialRating, onChange) {
  container.innerHTML = "";

  let selectedRating = initialRating;

  const starButtons = [1, 2, 3, 4, 5].map(function (n) {
    const starButton = document.createElement("button");
    starButton.type = "button";
    starButton.className = "star-button";
    starButton.textContent = "★"; // 文字は常に★のまま。色の変化だけで「光っているか」を表す

    // マウスを乗せた星までを光らせる（まだ確定はしない）
    starButton.addEventListener("mouseenter", function () {
      highlightStars(n);
    });

    // クリックした星までの数を、実際の評価として確定する
    starButton.addEventListener("click", function () {
      selectedRating = n;
      highlightStars(n);
      onChange(n);
    });

    container.appendChild(starButton);
    return starButton;
  });

  // マウスが星の外に出たら、確定済みの評価の数に戻す
  container.addEventListener("mouseleave", function () {
    highlightStars(selectedRating);
  });

  // 指定した数までの星に色を付ける（CSSのtransitionで、ふわっと変化させる）
  function highlightStars(count) {
    starButtons.forEach(function (starButton, index) {
      starButton.classList.toggle("star-filled", index < count);
    });
  }

  highlightStars(selectedRating);
}
