// ---------- 本の追加：バーコード（ISBN）を読み取って検索する ----------
// カメラでISBNのバーコード（EAN-13）を読み取り、Google Books APIで検索して
// 「検索して追加」と同じ結果一覧に表示する。読み取り自体はjs/vendor/zxing.umd.min.js（同梱の外部ライブラリ）が行う。

const bookBarcodeScanButton = document.getElementById("book-barcode-scan-button");
const bookBarcodeModal = document.getElementById("book-barcode-modal");
const bookBarcodeCloseButton = document.getElementById("book-barcode-close-button");
const bookBarcodeVideo = document.getElementById("book-barcode-video");
const bookBarcodeStatus = document.getElementById("book-barcode-status");

// 読み取り中のスキャン（止めるための controls）と、カメラの映像ストリーム
let barcodeScanControls = null;
let barcodeMediaStream = null;

// 1回のスキャンにつき、検索は1回だけ行う（連続するフレームで何度も反応しないようにする）
let hasHandledBarcodeResult = false;

// ISBN用の読み取り機（本の裏表紙のバーコードは基本的にEAN-13のため、対象フォーマットを絞って精度・速度を上げる）
function createBarcodeReader() {
  const hints = new Map();
  hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
    ZXing.BarcodeFormat.EAN_13,
    ZXing.BarcodeFormat.EAN_8,
    ZXing.BarcodeFormat.UPC_A,
    ZXing.BarcodeFormat.UPC_E
  ]);
  return new ZXing.BrowserMultiFormatReader(hints);
}

// カメラを止め、読み取りを終了する（モーダルを閉じるときは必ず呼ぶ）
function stopBarcodeScanning() {
  if (barcodeScanControls) {
    barcodeScanControls.stop();
    barcodeScanControls = null;
  }
  if (barcodeMediaStream) {
    barcodeMediaStream.getTracks().forEach(function (track) {
      track.stop();
    });
    barcodeMediaStream = null;
  }
  bookBarcodeVideo.srcObject = null;
}

function openBarcodeModal() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    alert("このブラウザはカメラでの読み取りに対応していません。「または、手動で入力」から入力してください。");
    return;
  }
  if (typeof ZXing === "undefined") {
    alert("バーコード読み取り機能の読み込みに失敗しました。ページを再読み込みしてお試しください。");
    return;
  }

  hasHandledBarcodeResult = false;
  bookBarcodeStatus.textContent = "カメラを起動しています…";
  bookBarcodeModal.hidden = false;

  const codeReader = createBarcodeReader();

  codeReader
    .decodeFromConstraints(
      { video: { facingMode: { ideal: "environment" } } },
      bookBarcodeVideo,
      function (result, error, controls) {
        if (controls) {
          barcodeScanControls = controls; // 最新のcontrolsを覚えておく（バージョンによって渡され方が違うための保険）
        }
        if (result && !hasHandledBarcodeResult) {
          hasHandledBarcodeResult = true;
          handleBarcodeDetected(result.getText());
        }
        // 見つからないフレームでは毎回NotFoundExceptionが渡ってくる（正常な動作なので無視する）
      }
    )
    .then(function (controls) {
      barcodeScanControls = controls;
      if (bookBarcodeVideo.srcObject) {
        barcodeMediaStream = bookBarcodeVideo.srcObject;
      }
      bookBarcodeStatus.textContent = "バーコードを枠の中に収めてください";
    })
    .catch(function (error) {
      console.error("バーコード読み取り用カメラの起動に失敗しました:", error);
      bookBarcodeStatus.textContent = "カメラを起動できませんでした。カメラへのアクセスを許可してください。";
    });
}

function closeBarcodeModal() {
  stopBarcodeScanning();
  bookBarcodeModal.hidden = true;
}

// バーコード（ISBN）を読み取れたら、スキャンを終えてGoogle Books APIで検索する
function handleBarcodeDetected(isbnText) {
  const isbn = isbnText.replace(/[^0-9Xx]/g, ""); // 稀に混ざる余分な文字を除いておく
  closeBarcodeModal();

  // 本の追加モーダル側の検索結果欄に、そのまま結果を表示する（検索して追加と同じ見た目・選び方にする）
  bookSearchButton.disabled = true;
  bookSearchButton.textContent = "検索中…";

  searchBooksByTitle(
    isbn,
    "isbn",
    function (results) {
      renderSearchResults(results);
      bookSearchButton.disabled = false;
      bookSearchButton.textContent = "検索";
      if (results.length === 0) {
        showToast("バーコードは読み取れましたが、本が見つかりませんでした");
      }
    },
    function (error) {
      console.error("ISBN検索に失敗しました:", error);
      alert("検索に失敗しました。通信環境を確認してください。");
      bookSearchButton.disabled = false;
      bookSearchButton.textContent = "検索";
    }
  );
}

bookBarcodeScanButton.addEventListener("click", openBarcodeModal);
bookBarcodeCloseButton.addEventListener("click", closeBarcodeModal);
bindModalDismissal(bookBarcodeModal, closeBarcodeModal);
