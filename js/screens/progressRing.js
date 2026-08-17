// ---------- 進捗リングの共通部品 ----------
// 本一覧の表紙や、ダッシュボードの「今読んでいる本」カードに重ねて使う、
// 円形に％を書き込む小さな進捗リング。本の詳細画面の大きな進捗リング（js/screens/progress.js）とは
// 表示先が違うだけで、考え方（円周の長さぶんstroke-dasharray/dashoffsetで塗り具合を表す）は同じ。

const MINI_PROGRESS_RING_RADIUS = 16;
const MINI_PROGRESS_RING_CIRCUMFERENCE = 2 * Math.PI * MINI_PROGRESS_RING_RADIUS;
const SVG_NS = "http://www.w3.org/2000/svg";

// percent（0〜100）から、円形の進捗リング＋中央に「％」の数字を表示する要素を組み立てる。
// extraClassName：表示先ごとにサイズなどを変えたいときに、外枠へ追加で付けるクラス名（任意）
function buildMiniProgressRing(percent, extraClassName) {
  const wrapper = document.createElement("div");
  wrapper.className = "mini-progress-ring" + (extraClassName ? " " + extraClassName : "");

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "mini-progress-ring-svg");
  svg.setAttribute("viewBox", "0 0 40 40");

  const track = document.createElementNS(SVG_NS, "circle");
  track.setAttribute("class", "mini-progress-ring-track");
  track.setAttribute("cx", "20");
  track.setAttribute("cy", "20");
  track.setAttribute("r", String(MINI_PROGRESS_RING_RADIUS));
  svg.appendChild(track);

  const fill = document.createElementNS(SVG_NS, "circle");
  fill.setAttribute("class", "mini-progress-ring-fill");
  fill.setAttribute("cx", "20");
  fill.setAttribute("cy", "20");
  fill.setAttribute("r", String(MINI_PROGRESS_RING_RADIUS));
  fill.style.strokeDasharray = String(MINI_PROGRESS_RING_CIRCUMFERENCE);
  fill.style.strokeDashoffset = String(MINI_PROGRESS_RING_CIRCUMFERENCE * (1 - percent / 100));
  svg.appendChild(fill);

  wrapper.appendChild(svg);

  const label = document.createElement("span");
  label.className = "mini-progress-ring-label";
  label.textContent = percent + "%";
  wrapper.appendChild(label);

  return wrapper;
}
