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

// ---------- 一覧のカードにつける「⋮」メニュー ----------
// 読書履歴・好きな言葉・学んだことのカードは、「編集」「削除」のボタンがそのまま並んでいると
// スマホでは指で押しにくかったため、本一覧のカード（js/screens/books.js）と同じ
// 「⋮」を押すとメニューが開く形にまとめられるよう、共通の部品にしておく。

// 今開いているメニュー（無ければnull）。他のメニューを開いたときや、外側をクリックしたときに閉じる
let openCardMenuDropdown = null;

function closeOpenCardMenu() {
  if (openCardMenuDropdown) {
    openCardMenuDropdown.hidden = true;
    openCardMenuDropdown = null;
  }
}

document.addEventListener("click", closeOpenCardMenu);

// actions: [{ label: "編集", onClick: function () {...}, danger: true/false }, ...]
function buildCardMenu(actions) {
  const menuWrapper = document.createElement("div");
  menuWrapper.className = "card-menu";

  const menuButton = document.createElement("button");
  menuButton.type = "button";
  menuButton.className = "card-menu-button";
  menuButton.textContent = "⋮";
  menuButton.setAttribute("aria-label", "メニューを開く");

  const dropdown = document.createElement("ul");
  dropdown.className = "card-menu-dropdown";
  dropdown.hidden = true;

  // メニューボタン・ドロップダウンのクリックが、カード全体のクリック（詳細への遷移など）に伝わらないようにする
  menuWrapper.addEventListener("click", function (event) {
    event.stopPropagation();
  });

  menuButton.addEventListener("click", function () {
    const willOpen = dropdown.hidden;
    closeOpenCardMenu();
    if (willOpen) {
      dropdown.hidden = false;
      openCardMenuDropdown = dropdown;
    }
  });

  actions.forEach(function (action) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = action.label;
    if (action.danger) {
      button.classList.add("danger-button");
    }
    button.addEventListener("click", function () {
      closeOpenCardMenu();
      action.onClick();
    });
    item.appendChild(button);
    dropdown.appendChild(item);
  });

  menuWrapper.appendChild(menuButton);
  menuWrapper.appendChild(dropdown);

  return menuWrapper;
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
