// 「統計」画面（読了した本・学んだこと・連続記録日数・学んだことの推移）関連の要素を取得しておく
const statsEmptyMessage = document.getElementById("stats-empty-message");
const statsContent = document.getElementById("stats-content");
const statsFinishedCountEl = document.getElementById("stats-finished-count");
const statsLearningCountEl = document.getElementById("stats-learning-count");
const statsStreakCountEl = document.getElementById("stats-streak-count");

// 「統計」画面を最新の状態で表示する
function renderStatsScreen() {
  const books = loadBooks();

  if (books.length === 0) {
    statsEmptyMessage.hidden = false;
    statsContent.hidden = true;
    return;
  }

  statsEmptyMessage.hidden = true;
  statsContent.hidden = false;

  const learnings = loadFavoriteLearnings();
  const finishedCount = books.filter(function (book) {
    return getBookStatusInfo(book).key === "done";
  }).length;

  animateNumber(statsFinishedCountEl, finishedCount);
  animateNumber(statsLearningCountEl, learnings.length);
  animateNumber(statsStreakCountEl, getReadingStreakDays());

  trendAllLearnings = learnings;
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

// 今、画面に表示している「学んだこと」（renderStatsScreenのたびに更新される）
let trendAllLearnings = [];

// 今、選択されている期間（"day" | "week" | "month" | "year"）
let currentTrendPeriod = "day";

// 指定した期間の区切りごとに、「学んだこと」の件数を合計する
function buildTrendBucketTotals(learnings, keyFn) {
  const totals = {};
  learnings.forEach(function (learning) {
    if (!learning.createdAt) {
      return; // 日時が分からないものは、区切りが分からないので集計から外す
    }
    const key = keyFn(new Date(learning.createdAt));
    totals[key] = (totals[key] || 0) + 1;
  });
  return totals;
}

// 指定した期間の、直近ぶんのバー（区切り・ラベル・件数）を組み立てる
function buildTrendBuckets(period, learnings) {
  const config = TREND_PERIOD_CONFIG[period];
  const totals = buildTrendBucketTotals(learnings, config.keyFn);
  const now = new Date();

  const buckets = [];
  for (let i = config.count - 1; i >= 0; i--) {
    const bucketDate = config.stepFn(now, i);
    const key = config.keyFn(bucketDate);
    buckets.push({
      label: config.labelFn(bucketDate),
      fullLabel: config.fullLabelFn(bucketDate),
      count: totals[key] || 0
    });
  }
  return buckets;
}

// 棒グラフの一番高い値をもとに、縦軸のきりのいい上限（件数）を決める
// （例：最大3件なら5件、最大37件なら50件、というように、TREND_AXIS_TICK_COUNT等分しやすい数に丸める）
function computeTrendAxisMax(maxCount) {
  if (maxCount <= 0) {
    return 5; // 記録が無いときの目盛りの既定値
  }

  const roughStep = maxCount / (TREND_AXIS_TICK_COUNT - 1);
  // 目盛りは常に件数の整数で表示するため、間隔（niceStep）が1未満にならないようにする。
  // ここをMath.floorのままにすると、件数が少ないとき（例：最大2件）に間隔が0.5などの端数になり、
  // 整数に丸めた際に同じ表記が連続するバグになる
  const magnitude = Math.pow(10, Math.max(0, Math.floor(Math.log10(roughStep))));
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

// 縦軸の目盛り（件数）と、横のグリッド線を描画する
function renderTrendAxis(axisMax) {
  trendChartAxis.innerHTML = "";
  trendChartGrid.innerHTML = "";

  for (let i = TREND_AXIS_TICK_COUNT - 1; i >= 0; i--) {
    const tickValue = Math.round((axisMax * i) / (TREND_AXIS_TICK_COUNT - 1));

    const labelEl = document.createElement("span");
    labelEl.className = "trend-chart-axis-label";
    labelEl.textContent = tickValue + "件";
    trendChartAxis.appendChild(labelEl);

    const lineEl = document.createElement("div");
    lineEl.className = "trend-chart-grid-line";
    trendChartGrid.appendChild(lineEl);
  }
}

// 選択中の期間で、学んだことの推移を棒グラフとして描画する
function renderTrendChart(period) {
  currentTrendPeriod = period;

  chartPeriodTabs.forEach(function (tab) {
    const isActive = tab.dataset.period === period;
    tab.classList.toggle("active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  });

  hideTrendTooltip();
  trendChartBars.innerHTML = "";

  const buckets = buildTrendBuckets(period, trendAllLearnings);
  const maxCount = buckets.reduce(function (max, bucket) {
    return Math.max(max, bucket.count);
  }, 0);
  const axisMax = computeTrendAxisMax(maxCount);
  renderTrendAxis(axisMax);

  buckets.forEach(function (bucket) {
    const col = document.createElement("div");
    col.className = "trend-chart-col";

    const barWrapper = document.createElement("div");
    barWrapper.className = "trend-chart-bar-wrapper";

    const bar = document.createElement("div");
    bar.className = "trend-chart-bar";
    // 縦軸の上限を100%とした割合で高さを決める（0件はバーが見えないよう高さ0のままにする）
    const heightPercent = axisMax > 0 && bucket.count > 0 ? (bucket.count / axisMax) * 100 : 0;
    bar.style.height = (bucket.count > 0 ? Math.max(heightPercent, 3) : 0) + "%";

    bar.tabIndex = 0;
    bar.setAttribute("role", "img");
    bar.setAttribute("aria-label", bucket.fullLabel + "：" + bucket.count + "件");

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

// バーの上に、詳しいラベルと件数を表示するツールチップを出す
function showTrendTooltip(barEl, bucket) {
  trendTooltip.textContent = "";

  const valueEl = document.createElement("strong");
  valueEl.textContent = bucket.count + "件";
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
