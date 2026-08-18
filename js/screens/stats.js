// 「統計」画面（読書スピード・平均時間・読書時間の推移）関連の要素を取得しておく
const statsEmptyMessage = document.getElementById("stats-empty-message");
const statsContent = document.getElementById("stats-content");
const statsSpeedEl = document.getElementById("stats-speed");
const statsAvgSessionEl = document.getElementById("stats-avg-session");

// 「統計」画面を最新の状態で表示する（アクティブなカテゴリの本だけを対象にする）
function renderStatsScreen() {
  // 読書時間などの統計は、実用書・小説どちらかに絞らず、両方の記録を合計して出す
  const books = loadBooks();
  const allRecords = collectAllRecords(books); // js/screens/allRecords.js の関数を再利用する

  if (allRecords.length === 0) {
    // 本が1冊も無いときは「読書タイマーで記録すると」ではなく、まず本の登録を案内する
    statsEmptyMessage.textContent = books.length === 0
      ? "まだ本が登録されていません。まず本を登録すると、ここに統計が表示されます。"
      : "まだ読書記録がありません。読書タイマーで記録すると、ここに統計が表示されます。";
    statsEmptyMessage.hidden = false;
    statsContent.hidden = true;
    return;
  }

  statsEmptyMessage.hidden = true;
  statsContent.hidden = false;

  const totalMinutes = allRecords.reduce(function (sum, record) {
    return sum + record.minutes;
  }, 0);
  const totalPages = allRecords.reduce(function (sum, record) {
    return sum + (record.pages || 0);
  }, 0);
  const sessionCount = allRecords.length;

  // 平均読書スピード：15分あたり何ページ読めるか
  const speedPer15Min = totalMinutes > 0 ? (totalPages / totalMinutes) * 15 : 0;
  statsSpeedEl.textContent = totalMinutes > 0 ? speedPer15Min.toFixed(1) : "―";

  // 1回あたりの平均読書時間
  const avgSessionMinutes = sessionCount > 0 ? totalMinutes / sessionCount : 0;
  statsAvgSessionEl.textContent = sessionCount > 0 ? Math.round(avgSessionMinutes) : "―";

  trendAllRecords = allRecords;
  renderTrendChart(currentTrendPeriod);
}

// ---------- 読書時間の推移（棒グラフ・日/週/月/年の切り替え） ----------

const chartPeriodTabs = document.querySelectorAll(".chart-period-tab");
const trendChart = document.querySelector(".trend-chart");
const trendChartBars = document.getElementById("trend-chart-bars");
const trendChartAxis = document.getElementById("trend-chart-axis");
const trendChartGrid = document.getElementById("trend-chart-grid");
const trendTooltip = document.getElementById("trend-tooltip");

// 縦軸の目盛りの数（0を含む。例：5なら0・25%・50%・75%・100%の5本）
const TREND_AXIS_TICK_COUNT = 5;

// タップでツールチップを開いたままにしているバー（スマホなど、マウスが無い環境用）
let tooltipPinnedBar = null;

// 数字の頭を0埋めする（例：8 → "08"）
function padTwoDigits(n) {
  return String(n).padStart(2, "0");
}

// 日付から「YYYY-MM-DD」のキーを作る（同じ日の記録をまとめるための目印）
function getDayKey(date) {
  return date.getFullYear() + "-" + padTwoDigits(date.getMonth() + 1) + "-" + padTwoDigits(date.getDate());
}

// 指定した日付が含まれる週の月曜日（0時0分）を返す
function getWeekStartDate(date) {
  const weekStart = new Date(date);
  const day = weekStart.getDay(); // 0(日)〜6(土)
  const diffToMonday = day === 0 ? 6 : day - 1;
  weekStart.setDate(weekStart.getDate() - diffToMonday);
  weekStart.setHours(0, 0, 0, 0);
  return weekStart;
}

// 日付から「その週の月曜日」を表すキーを作る
function getWeekKey(date) {
  return getDayKey(getWeekStartDate(date));
}

// 日付から「YYYY-MM」のキーを作る
function getMonthKey(date) {
  return date.getFullYear() + "-" + padTwoDigits(date.getMonth() + 1);
}

// 日付から「YYYY」のキーを作る
function getYearKey(date) {
  return String(date.getFullYear());
}

// 日/週/月/年、それぞれの表示に必要な設定をまとめておく
// count: 何個ぶんのバーを表示するか / keyFn: 記録をまとめるためのキー / stepFn: 基準日からi個前の区切りの日付を求める
// labelFn: バーの下に出す短いラベル / fullLabelFn: ホバー時に出す詳しいラベル
const TREND_PERIOD_CONFIG = {
  day: {
    count: 7,
    keyFn: getDayKey,
    stepFn: function (baseDate, i) {
      const d = new Date(baseDate);
      d.setDate(d.getDate() - i);
      return d;
    },
    labelFn: function (date) {
      return (date.getMonth() + 1) + "/" + date.getDate();
    },
    fullLabelFn: function (date) {
      return (date.getMonth() + 1) + "月" + date.getDate() + "日（" + WEEKDAY_LABELS[date.getDay()] + "）";
    }
  },
  week: {
    count: 8,
    keyFn: getWeekKey,
    stepFn: function (baseDate, i) {
      const weekStart = getWeekStartDate(baseDate);
      weekStart.setDate(weekStart.getDate() - i * 7);
      return weekStart;
    },
    labelFn: function (date) {
      return (date.getMonth() + 1) + "/" + date.getDate();
    },
    fullLabelFn: function (date) {
      const weekEnd = new Date(date);
      weekEnd.setDate(weekEnd.getDate() + 6);
      return (date.getMonth() + 1) + "/" + date.getDate() + "〜" + (weekEnd.getMonth() + 1) + "/" + weekEnd.getDate() + "の週";
    }
  },
  month: {
    count: 12,
    keyFn: getMonthKey,
    stepFn: function (baseDate, i) {
      return new Date(baseDate.getFullYear(), baseDate.getMonth() - i, 1);
    },
    labelFn: function (date) {
      return (date.getMonth() + 1) + "月";
    },
    fullLabelFn: function (date) {
      return date.getFullYear() + "年" + (date.getMonth() + 1) + "月";
    }
  },
  year: {
    count: 5,
    keyFn: getYearKey,
    stepFn: function (baseDate, i) {
      return new Date(baseDate.getFullYear() - i, 0, 1);
    },
    labelFn: function (date) {
      return String(date.getFullYear());
    },
    fullLabelFn: function (date) {
      return date.getFullYear() + "年";
    }
  }
};

// 今、画面に表示している記録（renderStatsScreenのたびに更新される）
let trendAllRecords = [];

// 今、選択されている期間（"day" | "week" | "month" | "year"）
let currentTrendPeriod = "day";

// 指定した期間の区切りごとに、記録の分数を合計する
function buildTrendBucketTotals(allRecords, keyFn) {
  const totals = {};
  allRecords.forEach(function (record) {
    if (!record.timestamp) {
      return; // timestampがない古い記録は、区切りが分からないので集計から外す
    }
    const key = keyFn(new Date(record.timestamp));
    totals[key] = (totals[key] || 0) + record.minutes;
  });
  return totals;
}

// 指定した期間の、直近ぶんのバー（区切り・ラベル・分数）を組み立てる
function buildTrendBuckets(period, allRecords) {
  const config = TREND_PERIOD_CONFIG[period];
  const totals = buildTrendBucketTotals(allRecords, config.keyFn);
  const now = new Date();

  const buckets = [];
  for (let i = config.count - 1; i >= 0; i--) {
    const bucketDate = config.stepFn(now, i);
    const key = config.keyFn(bucketDate);
    buckets.push({
      label: config.labelFn(bucketDate),
      fullLabel: config.fullLabelFn(bucketDate),
      minutes: totals[key] || 0
    });
  }
  return buckets;
}

// 棒グラフの一番高い値をもとに、縦軸のきりのいい上限（分）を決める
// （例：最大37分なら50分、最大95分なら100分、というように、TREND_AXIS_TICK_COUNT等分しやすい数に丸める）
function computeTrendAxisMax(maxMinutes) {
  if (maxMinutes <= 0) {
    return 60; // 記録が無いときの目盛りの既定値
  }

  const roughStep = maxMinutes / (TREND_AXIS_TICK_COUNT - 1);
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const normalized = roughStep / magnitude;

  let niceStep;
  if (normalized <= 1) {
    niceStep = 1;
  } else if (normalized <= 2) {
    niceStep = 2;
  } else if (normalized <= 5) {
    niceStep = 5;
  } else {
    niceStep = 10;
  }
  niceStep *= magnitude;

  return niceStep * (TREND_AXIS_TICK_COUNT - 1);
}

// 縦軸の目盛り（分の数字）と、横のグリッド線を描画する
function renderTrendAxis(axisMax) {
  trendChartAxis.innerHTML = "";
  trendChartGrid.innerHTML = "";

  for (let i = TREND_AXIS_TICK_COUNT - 1; i >= 0; i--) {
    const tickValue = Math.round((axisMax * i) / (TREND_AXIS_TICK_COUNT - 1));

    const labelEl = document.createElement("span");
    labelEl.className = "trend-chart-axis-label";
    labelEl.textContent = tickValue + "分";
    trendChartAxis.appendChild(labelEl);

    const lineEl = document.createElement("div");
    lineEl.className = "trend-chart-grid-line";
    trendChartGrid.appendChild(lineEl);
  }
}

// 選択中の期間で、読書時間の推移を棒グラフとして描画する
function renderTrendChart(period) {
  currentTrendPeriod = period;

  chartPeriodTabs.forEach(function (tab) {
    const isActive = tab.dataset.period === period;
    tab.classList.toggle("active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  });

  hideTrendTooltip();
  trendChartBars.innerHTML = "";

  const buckets = buildTrendBuckets(period, trendAllRecords);
  const maxMinutes = buckets.reduce(function (max, bucket) {
    return Math.max(max, bucket.minutes);
  }, 0);
  const axisMax = computeTrendAxisMax(maxMinutes);
  renderTrendAxis(axisMax);

  buckets.forEach(function (bucket) {
    const col = document.createElement("div");
    col.className = "trend-chart-col";

    const barWrapper = document.createElement("div");
    barWrapper.className = "trend-chart-bar-wrapper";

    const bar = document.createElement("div");
    bar.className = "trend-chart-bar";
    // 縦軸の上限を100%とした割合で高さを決める（0分はバーが見えないよう高さ0のままにする）
    const heightPercent = axisMax > 0 && bucket.minutes > 0 ? (bucket.minutes / axisMax) * 100 : 0;
    bar.style.height = (bucket.minutes > 0 ? Math.max(heightPercent, 3) : 0) + "%";

    bar.tabIndex = 0;
    bar.setAttribute("role", "img");
    bar.setAttribute("aria-label", bucket.fullLabel + "：" + bucket.minutes + "分");

    bar.addEventListener("mouseenter", function () {
      showTrendTooltip(bar, bucket);
    });
    bar.addEventListener("focus", function () {
      showTrendTooltip(bar, bucket);
    });
    bar.addEventListener("mouseleave", hideTrendTooltip);
    bar.addEventListener("blur", hideTrendTooltip);

    // スマホなどタッチ操作の環境ではmouseenterが発生しないため、タップでも同じように読書時間を確認できるようにする
    bar.addEventListener("click", function (event) {
      event.stopPropagation(); // documentのクリックで閉じる処理に伝わらないようにする
      if (tooltipPinnedBar === bar) {
        hideTrendTooltip();
      } else {
        showTrendTooltip(bar, bucket);
        tooltipPinnedBar = bar;
      }
    });

    barWrapper.appendChild(bar);
    col.appendChild(barWrapper);

    const labelEl = document.createElement("span");
    labelEl.className = "trend-chart-label";
    labelEl.textContent = bucket.label;
    col.appendChild(labelEl);

    trendChartBars.appendChild(col);
  });
}

// バー以外の場所をタップ／クリックしたら、タップで開いたままのツールチップを閉じる
document.addEventListener("click", function () {
  if (tooltipPinnedBar) {
    hideTrendTooltip();
  }
});

// バーの上に、詳しいラベルと分数を表示するツールチップを出す
function showTrendTooltip(barEl, bucket) {
  trendTooltip.textContent = "";

  const valueEl = document.createElement("strong");
  valueEl.textContent = bucket.minutes + "分";
  trendTooltip.appendChild(valueEl);

  const labelEl = document.createElement("span");
  labelEl.textContent = bucket.fullLabel;
  trendTooltip.appendChild(labelEl);

  // trendTooltipの位置の基準（position:relative）は.trend-chartなので、そこからのオフセットで計算する
  const barRect = barEl.getBoundingClientRect();
  const containerRect = trendChart.getBoundingClientRect();
  trendTooltip.style.left = (barRect.left - containerRect.left + barRect.width / 2) + "px";
  trendTooltip.style.top = (barRect.top - containerRect.top) + "px";
  trendTooltip.hidden = false;
}

// ツールチップを隠す
function hideTrendTooltip() {
  trendTooltip.hidden = true;
  tooltipPinnedBar = null;
}

// タブ（日/週/月/年）が押されたら、その期間の棒グラフに切り替える
chartPeriodTabs.forEach(function (tab) {
  tab.addEventListener("click", function () {
    renderTrendChart(tab.dataset.period);
  });
});
