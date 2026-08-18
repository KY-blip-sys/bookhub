// ---------- localStorage 汎用エンジン ----------
// 各モデルファイル（booksModel.js・actionsModel.js・reviewsModel.js）は、
// ここにある2つの関数を使ってデータをJSONとして保存・読み込みする。
// ダークモード設定やAPIキー、アクティブなカテゴリのような単純な文字列1つだけの値は、
// 各モデルファイルでlocalStorageを直接読み書きする（JSON化する必要がないため）。

// 指定したキーの値をJSONとして読み込む（保存されていなければfallbackを返す）
function loadJSON(key, fallback) {
  const json = localStorage.getItem(key);
  if (!json) {
    return fallback;
  }
  return JSON.parse(json);
}

// 指定したキーに、値をJSONとして保存する
function saveJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

// ---------- 数値入力欄（全角・半角どちらの数字にも対応する） ----------
// type="number"は全角数字を受け付けないため、数値入力欄はtype="text"にしたうえで
// この仕組みで「数字以外は入力させない」「全角数字は半角に変換する」を行う。

// 全角数字（０-９）を半角に変換する
function toHalfWidthDigits(value) {
  return String(value).replace(/[０-９]/g, function (fullWidthChar) {
    return String.fromCharCode(fullWidthChar.charCodeAt(0) - 0xfee0);
  });
}

// 指定した入力欄に、全角・半角どちらの数字を打っても半角の数字だけが残るようにする
function enableFlexibleDigitInput(inputEl) {
  inputEl.addEventListener("input", function () {
    const cursorFromEnd = inputEl.value.length - inputEl.selectionEnd;
    inputEl.value = toHalfWidthDigits(inputEl.value).replace(/[^0-9]/g, "");
    const newPosition = Math.max(0, inputEl.value.length - cursorFromEnd);
    inputEl.setSelectionRange(newPosition, newPosition);
  });
}

// ---------- Enterキーでの誤送信を防ぐ ----------
// 1つのフォームに入力欄が複数あると、他の欄を書き終える前にEnterキー（変換確定のEnterも含む）で
// フォーム全体が送信されてしまい、書きかけの内容が消えたり次の入力欄に紛れ込んだりすることがある。
// 指定した入力欄では、Enterキーを押しても送信されないようにする（保存はボタンを押したときだけ行う）
function preventEnterSubmit(inputEl) {
  inputEl.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      event.preventDefault();
    }
  });
}
