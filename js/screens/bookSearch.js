// ---------- 本の検索（本を追加するモーダル内）----------
// 「新しい本を追加」モーダル上部の検索欄から、js/services/googleBooks.jsのsearchGoogleBooks()経由で
// Google Books APIを検索し、選んだ結果を下の追加フォーム（books.js）へ自動入力する。
// フォーム側の要素（bookTitleInput・selectedCoverDataUrlなど）はbooks.jsで定義済みのものをそのまま使う。

const BOOK_SEARCH_DEBOUNCE_MS = 400;

const bookSearchInput = document.getElementById("book-search-input");
const bookSearchButton = document.getElementById("book-search-button");
const bookSearchResultsList = document.getElementById("book-search-results");
const bookSearchLoadingEl = document.getElementById("book-search-loading");
const bookSearchErrorEl = document.getElementById("book-search-error");
const bookSearchEmptyEl = document.getElementById("book-search-empty");
const bookManualEntryToggle = document.getElementById("book-manual-entry-toggle");
const bookManualEntrySection = document.getElementById("book-manual-entry-section");

let bookSearchDebounceTimer = null;
let bookSearchAbortController = null; // 検索中に新しい検索が始まったら、前の通信を打ち切るために覚えておく

// 検索結果まわりの表示（読込中・エラー・0件・一覧）をすべて隠す
function hideBookSearchStates() {
  bookSearchLoadingEl.hidden = true;
  bookSearchErrorEl.hidden = true;
  bookSearchEmptyEl.hidden = true;
  bookSearchResultsList.hidden = true;
}

// 読書ステータス・本の詳細入力欄を開く。
// 検索結果を選んだとき／検索で見つからなかったとき／「手動で入力する」を押したときに呼ぶ
function openManualEntry() {
  bookManualEntrySection.hidden = false;
  bookManualEntryToggle.hidden = true; // すでに開いているので、開くためのボタンはもう不要
}

// 読書ステータス・本の詳細入力欄を閉じる（基本の状態。モーダルを開き直すときに戻す）
function closeManualEntry() {
  bookManualEntrySection.hidden = true;
  bookManualEntryToggle.hidden = false;
}

bookManualEntryToggle.addEventListener("click", openManualEntry);

// 検索欄・検索結果を初期状態に戻す（モーダルを開き直す・閉じるときに呼ぶ）
function resetBookSearch() {
  if (bookSearchAbortController) {
    bookSearchAbortController.abort();
    bookSearchAbortController = null;
  }
  clearTimeout(bookSearchDebounceTimer);
  bookSearchInput.value = "";
  bookSearchResultsList.innerHTML = "";
  bookSearchButton.disabled = false;
  hideBookSearchStates();
  closeManualEntry();
}

// 検索結果1件ぶんのカードを組み立てる
function buildBookSearchResultCard(result) {
  const li = document.createElement("li");
  li.className = "book-search-result-card";
  li.addEventListener("click", function () {
    applyBookSearchResult(result);
  });

  const cover = document.createElement("div");
  cover.className = "book-search-result-cover";
  cover.appendChild(buildBookCoverContent(result, "book-search-result-cover-initial")); // books.js
  li.appendChild(cover);

  const info = document.createElement("div");
  info.className = "book-search-result-info";

  const titleEl = document.createElement("p");
  titleEl.className = "book-search-result-title";
  titleEl.textContent = result.title || "タイトル不明";
  info.appendChild(titleEl);

  const authorEl = document.createElement("p");
  authorEl.className = "book-search-result-meta";
  authorEl.textContent = result.author || "著者不明";
  info.appendChild(authorEl);

  const publisherMeta = [result.publisher, result.publishedDate].filter(Boolean).join(" ・ ");
  if (publisherMeta) {
    const metaEl = document.createElement("p");
    metaEl.className = "book-search-result-meta";
    metaEl.textContent = publisherMeta;
    info.appendChild(metaEl);
  }

  li.appendChild(info);

  const registerButton = document.createElement("button");
  registerButton.type = "button";
  registerButton.className = "book-search-result-register-button";
  registerButton.textContent = "登録";
  registerButton.addEventListener("click", function (event) {
    event.stopPropagation(); // カード全体のクリック（同じ処理）と二重に発火させない
    applyBookSearchResult(result);
  });
  li.appendChild(registerButton);

  return li;
}

function renderBookSearchResults(results) {
  bookSearchResultsList.innerHTML = "";

  if (results.length === 0) {
    bookSearchEmptyEl.hidden = false;
    openManualEntry(); // 検索で見つからなかったときは、自分で入力できるよう自動で開く
    return;
  }

  results.forEach(function (result) {
    bookSearchResultsList.appendChild(buildBookSearchResultCard(result));
  });
  bookSearchResultsList.hidden = false;
}

// 選ばれた検索結果を、下の追加フォームへ自動入力する（あとはユーザーが必要に応じて編集し、「本棚に追加」で保存する）
function applyBookSearchResult(result) {
  bookTitleInput.value = result.title || "";
  bookAuthorInput.value = result.author || "";
  bookPublisherInput.value = result.publisher || "";
  bookPublishedDateInput.value = result.publishedDate || "";
  bookIsbnInput.value = result.isbn || "";
  pageCountInput.value = result.pageCount || "";

  if (result.coverImage) {
    // 検索結果の表紙URLを、そのまま表紙として使う（ファイル選択と同じselectedCoverDataUrlを共有している）
    selectedCoverDataUrl = result.coverImage;
    coverUploadPreview.src = result.coverImage;
    coverUploadPreview.hidden = false;
    coverUploadPlaceholder.hidden = true;
  } else {
    clearSelectedCover(); // books.js
  }

  hideBookSearchStates();
  bookSearchResultsList.innerHTML = "";
  openManualEntry(); // 選んだ内容を確認・編集してから登録できるよう、入力欄を開く
  bookTitleInput.focus();
}

async function runBookSearch(keyword) {
  if (bookSearchAbortController) {
    bookSearchAbortController.abort(); // 前の検索がまだ終わっていなければ打ち切る（連打・連続入力での重複リクエスト防止）
  }
  const controller = new AbortController();
  bookSearchAbortController = controller;

  hideBookSearchStates();
  bookSearchLoadingEl.hidden = false;
  bookSearchButton.disabled = true;

  try {
    const results = await searchGoogleBooks(keyword, controller.signal); // js/services/googleBooks.js
    if (controller.signal.aborted) {
      return; // すでに新しい検索に置き換わっているので、この結果は使わない
    }
    hideBookSearchStates();
    renderBookSearchResults(results);
  } catch (error) {
    if (error.name === "AbortError") {
      return; // 打ち切られた検索なので、エラー表示はしない
    }
    console.error("[bookSearch] 検索に失敗しました:", error);
    hideBookSearchStates();
    bookSearchErrorEl.textContent = error.message || "検索に失敗しました。時間を置いて再度お試しください。";
    bookSearchErrorEl.hidden = false;
  } finally {
    if (bookSearchAbortController === controller) {
      bookSearchAbortController = null;
      bookSearchButton.disabled = false;
    }
  }
}

// 検索欄が空になったら、検索中の通信を打ち切って結果表示も消す
function cancelBookSearch() {
  clearTimeout(bookSearchDebounceTimer);
  if (bookSearchAbortController) {
    bookSearchAbortController.abort();
  }
  hideBookSearchStates();
  bookSearchResultsList.innerHTML = "";
}

// 今の検索欄の内容で、デバウンスを待たずすぐに検索する（Enterキー・検索ボタン用）
function searchNow() {
  clearTimeout(bookSearchDebounceTimer);
  const keyword = bookSearchInput.value.trim();
  if (!keyword) {
    cancelBookSearch();
    return;
  }
  runBookSearch(keyword);
}

// 入力のたびにAPIを呼ばず、一定時間（BOOK_SEARCH_DEBOUNCE_MS）入力が止まってから検索する
bookSearchInput.addEventListener("input", function () {
  clearTimeout(bookSearchDebounceTimer);
  const keyword = bookSearchInput.value.trim();
  if (!keyword) {
    cancelBookSearch();
    return;
  }
  bookSearchDebounceTimer = setTimeout(function () {
    runBookSearch(keyword);
  }, BOOK_SEARCH_DEBOUNCE_MS);
});

bookSearchInput.addEventListener("keydown", function (event) {
  if (event.key === "Enter") {
    event.preventDefault(); // フォームの外の欄だが、念のためEnterで何かが送信されるのを防ぐ
    searchNow();
  }
});

bookSearchButton.addEventListener("click", searchNow);
