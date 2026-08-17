// ---------- 日付入力：ブラウザ標準のプルダウン型カレンダーではなく、
// 指で回すスクロール式（年・月・日を3列で選ぶ）のピッカーに差し替える共通部品 ----------
// action-start-date等の日付欄はすべて readonly のテキスト欄にしてあり、
// タップすると、この1つの共有モーダルが年・月・日のホイールを持って浮かび上がる。

const SCROLL_DATE_ITEM_HEIGHT = 40; // 1項目ぶんの高さ(px)。CSS側の .scroll-date-item と合わせる
const SCROLL_DATE_YEARS_PAST = 10;
const SCROLL_DATE_YEARS_FUTURE = 10;

function scrollDatePad2(n) {
  return String(n).padStart(2, "0");
}

function scrollDateDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

// 「YYYY-MM-DD」を年・月・日に分解する（形が違う・空のときは今日を返す）
function scrollDateParseValue(value) {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parts = value.split("-");
    return { year: Number(parts[0]), month: Number(parts[1]), day: Number(parts[2]) };
  }
  const today = new Date();
  return { year: today.getFullYear(), month: today.getMonth() + 1, day: today.getDate() };
}

// 1列ぶんのスクロールホイールを組み立てる（年・月・日、時間・分など、スクロールで選ぶ列はすべて共通の仕組み）。
// itemHeight を省略すると、日付ピッカーの標準サイズ（40px）を使う。
// タイマーのように小さく収めたい場所では、対応するCSS側のサイズと合わせて、ここに小さい値を渡す。
function buildScrollDateColumn(containerEl, itemHeight) {
  const rowHeight = itemHeight || SCROLL_DATE_ITEM_HEIGHT;

  containerEl.innerHTML = "";

  const inner = document.createElement("div");
  inner.className = "scroll-date-col-inner";
  containerEl.appendChild(inner);

  let items = [];
  let itemEls = [];
  let selectedIndex = 0;
  let onChange = function () {};
  let settleTimer = null;

  containerEl.addEventListener("scroll", function () {
    clearTimeout(settleTimer);
    settleTimer = setTimeout(function () {
      applyIndex(Math.round(containerEl.scrollTop / rowHeight), false);
      onChange(items[selectedIndex]);
    }, 120);
  });

  function applyIndex(index, scrollTo) {
    index = Math.max(0, Math.min(index, items.length - 1));
    selectedIndex = index;
    itemEls.forEach(function (el, i) {
      el.classList.toggle("selected", i === index);
    });
    if (scrollTo) {
      containerEl.scrollTop = index * rowHeight;
    }
  }

  return {
    // items: 表示する値の配列（数値） / keepValue: 可能なら選んだ状態にしておきたい値
    setItems: function (newItems, keepValue) {
      items = newItems;
      inner.innerHTML = "";
      itemEls = items.map(function (item) {
        const el = document.createElement("div");
        el.className = "scroll-date-item";
        el.textContent = item;
        inner.appendChild(el);
        return el;
      });
      const index = keepValue !== undefined ? items.indexOf(keepValue) : -1;
      applyIndex(index === -1 ? 0 : index, true);
    },
    getValue: function () {
      return items[selectedIndex];
    },
    setOnChange: function (fn) {
      onChange = fn;
    }
  };
}

const scrollDateModal = document.getElementById("scroll-date-modal");
const scrollDateCloseButton = document.getElementById("scroll-date-close-button");
const scrollDateConfirmButton = document.getElementById("scroll-date-confirm-button");
const scrollDateCancelButton = document.getElementById("scroll-date-cancel-button");

const scrollDateYearCol = buildScrollDateColumn(document.getElementById("scroll-date-year-col"));
const scrollDateMonthCol = buildScrollDateColumn(document.getElementById("scroll-date-month-col"));
const scrollDateDayCol = buildScrollDateColumn(document.getElementById("scroll-date-day-col"));

const SCROLL_DATE_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

// 今、日付を入力しようとしている対象のinput要素（モーダルを開いていなければnull）
let scrollDateTargetInput = null;

// 年・月から日数を数え直して、日の列を作り直す（うるう年で2/29が消えるときなどに対応）
function refreshScrollDateDays(keepDay) {
  const year = scrollDateYearCol.getValue();
  const month = scrollDateMonthCol.getValue();
  const maxDay = scrollDateDaysInMonth(year, month);
  const days = [];
  for (let d = 1; d <= maxDay; d++) {
    days.push(d);
  }
  scrollDateDayCol.setItems(days, keepDay);
}

scrollDateYearCol.setOnChange(function () {
  refreshScrollDateDays(scrollDateDayCol.getValue());
});
scrollDateMonthCol.setOnChange(function () {
  refreshScrollDateDays(scrollDateDayCol.getValue());
});

function openScrollDateModal(inputEl) {
  scrollDateTargetInput = inputEl;
  const initial = scrollDateParseValue(inputEl.value);

  const currentYear = new Date().getFullYear();
  const years = [];
  for (let y = currentYear - SCROLL_DATE_YEARS_PAST; y <= currentYear + SCROLL_DATE_YEARS_FUTURE; y++) {
    years.push(y);
  }

  scrollDateModal.hidden = false;

  // 列の高さが確定してから位置を合わせたいので、表示した後に項目を入れる
  scrollDateYearCol.setItems(years, initial.year);
  scrollDateMonthCol.setItems(SCROLL_DATE_MONTHS, initial.month);
  refreshScrollDateDays(initial.day);
}

function closeScrollDateModal() {
  scrollDateModal.hidden = true;
  scrollDateTargetInput = null;
}

scrollDateCloseButton.addEventListener("click", closeScrollDateModal);
scrollDateCancelButton.addEventListener("click", closeScrollDateModal);
bindModalDismissal(scrollDateModal, closeScrollDateModal);

scrollDateConfirmButton.addEventListener("click", function () {
  if (!scrollDateTargetInput) {
    return;
  }
  const year = scrollDateYearCol.getValue();
  const month = scrollDateMonthCol.getValue();
  const day = scrollDateDayCol.getValue();
  scrollDateTargetInput.value = year + "-" + scrollDatePad2(month) + "-" + scrollDatePad2(day);
  scrollDateTargetInput.dispatchEvent(new Event("change", { bubbles: true }));
  closeScrollDateModal();
});

// 日付欄（.scroll-date-input）をタップしたら、スクロール式のピッカーを開けるようにする
// 記録直後・後からの追加のように、同じ形の日付欄がHTMLに最初からあるものはここでまとめて登録し、
// 実践の編集フォームのようにJavaScriptで後から作られる日付欄は、作った側でこの関数を個別に呼ぶ
function bindScrollDateInput(inputEl) {
  inputEl.addEventListener("click", function () {
    openScrollDateModal(inputEl);
  });
  inputEl.addEventListener("keydown", function (event) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openScrollDateModal(inputEl);
    }
  });
}

document.querySelectorAll(".scroll-date-input").forEach(bindScrollDateInput);
