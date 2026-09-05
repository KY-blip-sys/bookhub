// ---------- PWA対応 ----------
// Service Workerの登録、ホーム画面への追加導線（Android/PC・iPhone）、更新通知、オフライン表示をまとめて担当する。
// 他の画面ファイルの初期化とは完全に独立しているため、依存はDOM要素とブラウザAPIだけにしている。

// 既にホーム画面から起動された状態（スタンドアロン表示）かどうか
function isRunningStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

// ---------- Service Workerの登録・更新通知 ----------

const updateBanner = document.getElementById("pwa-update-banner");
const updateButton = document.getElementById("pwa-update-button");
const updateDismissButton = document.getElementById("pwa-update-dismiss-button");

let waitingServiceWorker = null;

function showUpdateBanner(worker) {
  waitingServiceWorker = worker;
  updateBanner.hidden = false;
}

updateButton.addEventListener("click", function () {
  if (waitingServiceWorker) {
    waitingServiceWorker.postMessage("SKIP_WAITING");
  }
  updateBanner.hidden = true;
});

updateDismissButton.addEventListener("click", function () {
  updateBanner.hidden = true;
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("/sw.js").then(function (registration) {
      // 登録した時点ですでに新しいバージョンが待機中だった場合
      if (registration.waiting && navigator.serviceWorker.controller) {
        showUpdateBanner(registration.waiting);
      }

      registration.addEventListener("updatefound", function () {
        const newWorker = registration.installing;
        if (!newWorker) {
          return;
        }
        newWorker.addEventListener("statechange", function () {
          // "installed"かつ既存のcontrollerがある＝新しいバージョンに更新可能（初回インストールではない）
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            showUpdateBanner(newWorker);
          }
        });
      });
    }).catch(function (error) {
      console.error("Service Workerの登録に失敗しました", error);
    });

    // 「更新」でskipWaitingされ、新しいService Workerが実権を握ったら1度だけリロードして反映する
    let hasReloadedForUpdate = false;
    navigator.serviceWorker.addEventListener("controllerchange", function () {
      if (hasReloadedForUpdate) {
        return;
      }
      hasReloadedForUpdate = true;
      window.location.reload();
    });
  });
}

// ---------- インストール導線（Android・PC等：beforeinstallprompt対応ブラウザ） ----------

const installButton = document.getElementById("pwa-install-button");
let deferredInstallPrompt = null;

window.addEventListener("beforeinstallprompt", function (event) {
  event.preventDefault();
  if (isRunningStandalone()) {
    return;
  }
  deferredInstallPrompt = event;
  installButton.hidden = false;
});

installButton.addEventListener("click", function () {
  if (!deferredInstallPrompt) {
    return;
  }
  const promptEvent = deferredInstallPrompt;
  deferredInstallPrompt = null;
  installButton.hidden = true;
  promptEvent.prompt();
});

window.addEventListener("appinstalled", function () {
  installButton.hidden = true;
  deferredInstallPrompt = null;
});

// ---------- iPhone（Safari）向けの案内：初回だけ表示する ----------
// SafariはbeforeinstallpromptもiOS 16.4未満のstandalone判定APIも無いため、
// UA判定＋localStorageの既読フラグで「共有→ホーム画面に追加」の案内を1回だけ出す

const IOS_INSTALL_HINT_STORAGE_KEY = "bookhub-ios-install-hint-shown";
const iosHintBanner = document.getElementById("pwa-ios-hint");
const iosHintCloseButton = document.getElementById("pwa-ios-hint-close");

function isIosSafari() {
  const ua = window.navigator.userAgent;
  const isIosDevice = /iphone|ipad|ipod/i.test(ua) && !window.MSStream;
  const isSafariBrowser = /safari/i.test(ua) && !/crios|fxios|edgios|opios/i.test(ua);
  return isIosDevice && isSafariBrowser;
}

function hasSeenIosInstallHint() {
  try {
    return window.localStorage.getItem(IOS_INSTALL_HINT_STORAGE_KEY) === "1";
  } catch (error) {
    return false; // localStorageが使えない環境では、常に表示してよい
  }
}

function markIosInstallHintSeen() {
  try {
    window.localStorage.setItem(IOS_INSTALL_HINT_STORAGE_KEY, "1");
  } catch (error) {
    // 保存できなくても、今回非表示にできれば実害はない
  }
}

if (isIosSafari() && !isRunningStandalone() && !hasSeenIosInstallHint()) {
  iosHintBanner.hidden = false;
}

iosHintCloseButton.addEventListener("click", function () {
  iosHintBanner.hidden = true;
  markIosInstallHintSeen();
});

// ---------- オフライン表示 ----------

const offlineBanner = document.getElementById("pwa-offline-banner");

function updateOfflineBanner() {
  offlineBanner.hidden = navigator.onLine;
}

window.addEventListener("online", updateOfflineBanner);
window.addEventListener("offline", updateOfflineBanner);
updateOfflineBanner();
