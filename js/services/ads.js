// ---------- 広告表示の共通処理 ----------
// Freeプランのみ広告エリア（#ad-container）を表示し、Plus・Premium・Proでは非表示にする。
// 広告の表示可否はプランごとにサーバー側（api/_lib/aiCredits.jsのPLAN_CATALOG）で決まり、
// js/services/planStatus.jsが取得するstatus.adsをそのまま反映するだけにする
// （広告を出す・出さないの判定をここ以外に書かない）。

const adContainerEl = document.getElementById("ad-container");

// 広告配信サービス（Google AdSense等）のコードをまだ設置していないため、
// プラン判定に関わらず常に非表示にしておく。実際の広告コードをindex.htmlの
// .ad-slot内に設置したら、このフラグをtrueにすればプラン別の出し分けが有効になる
const ADS_CONFIGURED = false;

function applyAdVisibility(status) {
  if (!adContainerEl) {
    return;
  }
  if (!ADS_CONFIGURED) {
    adContainerEl.hidden = true;
    return;
  }
  // 状態が未取得の間（起動直後・未ログイン時）は、Freeプラン扱いで広告を表示したままにする
  adContainerEl.hidden = !!status && status.ads === false;
}

onPlanStatusChange(applyAdVisibility); // js/services/planStatus.js：プラン取得のたびに自動で反映する
