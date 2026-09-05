// BookHub Service Worker
// バンドラーを使わない素のHTML/CSS/JS構成に合わせて、Workbox等を使わず手書きしている。
// キャッシュの中身を戦略ごとに分けているので、バージョンを上げるときはCACHE_VERSIONだけ更新すればよい。
const CACHE_VERSION = "v1";
const SHELL_CACHE = "bookhub-shell-" + CACHE_VERSION;
const RUNTIME_CACHE = "bookhub-runtime-" + CACHE_VERSION;

// 初回インストール時に必ずキャッシュしておくもの（バージョン番号を含まない、めったに変わらないファイルだけに絞る）
const PRECACHE_URLS = [
  "/",
  "/offline.html",
  "/manifest.json",
  "/assets/icons/icon-192.png",
  "/assets/icons/icon-512.png",
  "/assets/icons/icon-512-maskable.png",
  "/assets/icons/apple-touch-icon.png",
  "/assets/icons/favicon-32.png",
  "/assets/icons/favicon-16.png",
];

// 静的アセットとしてキャッシュ対象にする拡張子（js/css/画像/フォント）
const STATIC_ASSET_PATTERN = /\.(?:css|js|png|jpg|jpeg|svg|webp|gif|ico|woff2?|ttf)(?:\?.*)?$/i;

// 自分のオリジン以外で、静的アセットとしてキャッシュしてよい相手（Google Fonts・Supabaseクライアントライブラリ）
const ALLOWED_CROSS_ORIGIN_HOSTS = [
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "cdn.jsdelivr.net",
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(function (cache) {
      return cache.addAll(PRECACHE_URLS);
    })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (cacheNames) {
      return Promise.all(
        cacheNames
          .filter(function (name) {
            return name !== SHELL_CACHE && name !== RUNTIME_CACHE;
          })
          .map(function (name) {
            return caches.delete(name);
          })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

// 「更新する」ボタンが押されたら、待機中のService Workerをすぐ有効化する
self.addEventListener("message", function (event) {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// ナビゲーション（画面遷移）：まずネットワークを試し、取れたら最新のHTMLをそのままキャッシュにも保存する。
// オフライン等でネットワークが取れなければ、前回キャッシュしたシェル→それも無ければオフライン専用画面を返す
function handleNavigationRequest(request) {
  // ブラウザのHTTPキャッシュ（heuristic caching）に隠れて古い判定になるのを避けるため、
  // ここだけは必ず実際のネットワーク到達性を確認しに行く
  return fetch(request, { cache: "no-store" })
    .then(function (response) {
      const responseClone = response.clone();
      caches.open(SHELL_CACHE).then(function (cache) {
        cache.put("/", responseClone);
      });
      return response;
    })
    .catch(function () {
      return caches.match("/").then(function (cached) {
        return cached || caches.match("/offline.html");
      });
    });
}

// 静的アセット：stale-while-revalidate（キャッシュがあればまず即座に返しつつ、裏でネットワークから最新版を取得してキャッシュを更新する）
function handleStaticAssetRequest(request) {
  return caches.open(RUNTIME_CACHE).then(function (cache) {
    return cache.match(request).then(function (cached) {
      const networkFetch = fetch(request)
        .then(function (response) {
          if (response && response.ok) {
            cache.put(request, response.clone());
          }
          return response;
        })
        .catch(function () {
          return cached;
        });
      return cached || networkFetch;
    });
  });
}

self.addEventListener("fetch", function (event) {
  const request = event.request;
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  // /api/配下（Supabase・Stripe・OpenAI等につながるサーバーレス関数）は常にネットワークへ。
  // 古いレスポンスを返すと課金・認証・在庫等の情報が食い違うおそれがあるため、一切キャッシュしない
  if (url.origin === self.location.origin && url.pathname.startsWith("/api/")) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(handleNavigationRequest(request));
    return;
  }

  const isSameOriginAsset = url.origin === self.location.origin && STATIC_ASSET_PATTERN.test(url.pathname);
  const isAllowedCrossOrigin = ALLOWED_CROSS_ORIGIN_HOSTS.indexOf(url.hostname) !== -1;

  if (isSameOriginAsset || isAllowedCrossOrigin) {
    event.respondWith(handleStaticAssetRequest(request));
  }
  // それ以外（AdSense・Google Books API・Supabase本体・OpenAI等）はService Workerが介入せず、
  // ブラウザの通常のネットワーク取得に任せる
});
