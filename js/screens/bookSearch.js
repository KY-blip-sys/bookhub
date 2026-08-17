// ---------- 本の検索（Google Books API） ----------
// この画面（本を追加するフォーム）だけで使う、検索・自動入力に関するコードをまとめています。

// 検索欄・検索結果の要素を取得しておく
const bookSearchInput = document.getElementById("book-search-input");
const bookSearchButton = document.getElementById("book-search-button");
const bookSearchResults = document.getElementById("book-search-results");

// ---------- 検索方法の切り替え（「タイトルで検索」／「著者で検索」） ----------
// 見た目はreading-status-toggleと同じピル型のボタン2つ。選ばれている方をbookSearchModeで覚えておく
const bookSearchModeToggle = document.getElementById("book-search-mode-toggle");
const bookSearchModeOptions = bookSearchModeToggle.querySelectorAll(".reading-status-option");
let bookSearchMode = "title";

const BOOK_SEARCH_PLACEHOLDERS = {
  title: "タイトルで検索",
  author: "著者名で検索"
};

bookSearchModeOptions.forEach(function (button) {
  button.addEventListener("click", function () {
    bookSearchModeOptions.forEach(function (b) {
      b.classList.remove("active");
    });
    button.classList.add("active");
    bookSearchMode = button.dataset.searchMode;
    bookSearchInput.placeholder = BOOK_SEARCH_PLACEHOLDERS[bookSearchMode];
    bookSearchResults.hidden = true;
  });
});

// 見た目・状態を両方とも「タイトルで検索」に戻す（本の追加フォームを閉じたときに使う）
function resetBookSearchModeToggle() {
  bookSearchModeOptions.forEach(function (button) {
    button.classList.toggle("active", button.dataset.searchMode === "title");
  });
  bookSearchMode = "title";
  bookSearchInput.placeholder = BOOK_SEARCH_PLACEHOLDERS.title;
}

// 検索結果から自動入力する、補足情報の要素を取得しておく
const bookFormMeta = document.getElementById("book-form-meta");
const pageCountInput = document.getElementById("book-page-count");
const pageCountManualNote = document.getElementById("page-count-manual-note");
enableFlexibleDigitInput(pageCountInput); // 全角数字で入力しても半角として扱う

// 検索で選んだ本の「出版社」「出版日」（フォームには専用の入力欄がないので、変数として覚えておく）
let bookPublisher = "";
let bookPublishedDate = "";

// タイトルまたは著者名でGoogle Books APIを検索し、結果を「本アプリ内で共通の形」に変換して返す。
// mode: "title"ならタイトルで（intitle:）、"author"なら著者名で（inauthor:）検索する
// ここではGoogle Books APIを直接呼んでいるが、将来「自前のサーバー経由で検索する」
// ように変える場合も、この関数の中身（fetchする先とデータの変換部分）を
// 書き換えるだけでよく、呼び出す側（画面の表示処理）は変更しなくて済む。
function searchBooksByTitle(query, mode, onSuccess, onError) {
  // APIキーが設定されていれば付ける（キーなしの場合、利用者全体で共有の少ない無料枠になる）
  const apiKey = loadGoogleBooksApiKey();
  const keyParam = apiKey ? "&key=" + encodeURIComponent(apiKey) : "";
  const searchField = mode === "author" ? "inauthor:" : "intitle:";

  const url =
    "https://www.googleapis.com/books/v1/volumes?maxResults=10&q=" +
    encodeURIComponent(searchField + query) +
    keyParam;

  // デバッグ用：実際に送るリクエストの中身をConsoleに残す
  // （APIキーの値そのものは出さず、「設定されているか」と「何文字か」だけを出す。
  // 　URLも念のためキー部分を***に置き換えてから出す）
  console.log(
    "[Google Books検索] APIキー:",
    apiKey ? "設定あり（" + apiKey.length + "文字）" : "未設定（共有の無料枠を使用）"
  );
  console.log(
    "[Google Books検索] リクエストURL:",
    apiKey ? url.replace(encodeURIComponent(apiKey), "***") : url
  );

  // 注：referrerPolicyを明示しないと、クロスオリジン向けのfetchはブラウザの既定挙動で
  // Referer（参照元URL）のパス部分を送らずオリジンのみを送ってしまう。
  // Google Cloud側のAPIキー制限はパス込みのURL（例：.../bookhub/*）で設定されることが多く、
  // パスが送られないと「リファラー制限違反」としてAPIキーが拒否されてしまうため、明示的に指定する。
  fetch(url, { referrerPolicy: "no-referrer-when-downgrade" })
    .then(function (response) {
      if (!response.ok) {
        // ステータスコードだけでなく、Googleが返す本文中のエラー理由（キー無効・リファラー制限など）も
        // Consoleで確認できるようにする（本文が読めない場合はステータスコードのみになる）
        return response
          .json()
          .catch(function () {
            return {};
          })
          .then(function (body) {
            const detail = body.error && body.error.message ? body.error.message : "";
            throw new Error(
              "検索に失敗しました（ステータスコード: " + response.status + "）" + (detail ? "：" + detail : "")
            );
          });
      }
      return response.json();
    })
    .then(function (data) {
      const items = data.items || [];

      // Google Books APIの生のデータ形式を、このアプリで使う共通の形に変換する
      const results = items.map(function (item) {
        const info = item.volumeInfo || {};
        const hasThumbnail = info.imageLinks && info.imageLinks.thumbnail;

        return {
          title: info.title || "",
          author: (info.authors || []).join("、"),
          publisher: info.publisher || "",
          publishedDate: info.publishedDate || "",
          pageCount: info.pageCount || null,
          // httpのままだと表示できない場合があるので、httpsに変換しておく
          coverImage: hasThumbnail ? info.imageLinks.thumbnail.replace("http://", "https://") : null
        };
      });

      onSuccess(results);
    })
    .catch(onError);
}

// 検索結果の一覧を画面に表示する
function renderSearchResults(results) {
  bookSearchResults.innerHTML = "";

  if (results.length === 0) {
    const emptyItem = document.createElement("li");
    emptyItem.className = "book-search-empty";
    emptyItem.textContent = "見つかりませんでした。";
    bookSearchResults.appendChild(emptyItem);
    bookSearchResults.hidden = false;
    return;
  }

  results.forEach(function (result) {
    const li = document.createElement("li");
    li.className = "book-search-result";
    li.addEventListener("click", function () {
      selectSearchResult(li, result);
    });

    const cover = document.createElement("div");
    cover.className = "book-search-result-cover";
    if (result.coverImage) {
      const img = document.createElement("img");
      img.src = result.coverImage;
      img.alt = result.title;
      cover.appendChild(img);
    }
    li.appendChild(cover);

    const info = document.createElement("div");
    info.className = "book-search-result-info";

    const titleEl = document.createElement("p");
    titleEl.className = "book-search-result-title";
    titleEl.textContent = result.title;
    info.appendChild(titleEl);

    const metaEl = document.createElement("p");
    metaEl.className = "book-search-result-meta";
    metaEl.textContent = result.author || "著者不明";
    info.appendChild(metaEl);

    li.appendChild(info);
    bookSearchResults.appendChild(li);
  });

  bookSearchResults.hidden = false;
}

// 選ばれた検索結果を、本の追加フォームへ自動入力する
function applySearchResult(result) {
  bookTitleInput.value = result.title;
  bookAuthorInput.value = result.author;

  bookPublisher = result.publisher;
  bookPublishedDate = result.publishedDate;

  if (bookPublisher || bookPublishedDate) {
    bookFormMeta.textContent = [bookPublisher, bookPublishedDate].filter(Boolean).join(" ・ ");
    bookFormMeta.hidden = false;
  } else {
    bookFormMeta.hidden = true;
  }

  if (result.coverImage) {
    // 検索結果の画像URLを、そのまま表紙として使う（ファイル選択と同じ変数を共有している）
    selectedCoverDataUrl = result.coverImage;
    coverUploadPreview.src = result.coverImage;
    coverUploadPreview.hidden = false;
    coverUploadPlaceholder.hidden = true;
  }

  if (result.pageCount) {
    pageCountInput.value = result.pageCount;
    pageCountManualNote.hidden = true;
  } else {
    // 総ページ数が取得できなかった場合は、手入力を促す注意書きを表示する
    pageCountInput.value = "";
    pageCountManualNote.hidden = false;
  }
}

// 検索結果を選んだときの処理。「選んだ」ことが一瞬わかるチェックマークの演出をはさんでから、
// フォームの内容（検索結果で自動入力した分）でそのまま送信し、タップ1回で本棚に追加する。
function selectSearchResult(li, result) {
  if (bookSearchResults.classList.contains("is-selecting")) {
    return; // 演出中の連続タップで、二重に追加されるのを防ぐ
  }
  bookSearchResults.classList.add("is-selecting");
  li.classList.add("book-search-result-selected");

  const check = document.createElement("span");
  check.className = "book-search-result-check";
  check.textContent = "✓";
  li.appendChild(check);

  applySearchResult(result);

  setTimeout(function () {
    bookSearchResults.hidden = true;
    bookSearchResults.classList.remove("is-selecting");
    bookForm.requestSubmit(); // book-form の送信処理（addBook呼び出し・モーダルを閉じる処理）をそのまま使う
  }, 280);
}

// 検索欄でEnterキーを押しても、検索ボタンを押したときと同じ動きにする
// （検索欄はform要素の外にあるため、Enterでの送信が自動では効かない）
bookSearchInput.addEventListener("keydown", function (event) {
  if (event.key === "Enter") {
    event.preventDefault();
    bookSearchButton.click();
  }
});

// 検索ボタンが押されたときの処理
bookSearchButton.addEventListener("click", function () {
  const query = bookSearchInput.value.trim();
  if (!query) {
    return;
  }

  bookSearchButton.disabled = true;
  bookSearchButton.textContent = "検索中…";

  searchBooksByTitle(
    query,
    bookSearchMode,
    function (results) {
      renderSearchResults(results);
      bookSearchButton.disabled = false;
      bookSearchButton.textContent = "検索";
    },
    function (error) {
      console.error("本の検索に失敗しました:", error); // 原因を調べられるよう、実際のエラー内容をConsoleに残す
      alert("検索に失敗しました。通信環境を確認してください。");
      bookSearchButton.disabled = false;
      bookSearchButton.textContent = "検索";
    }
  );
});
