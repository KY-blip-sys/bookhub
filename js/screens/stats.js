// 「統計」画面（読書スピード・平均時間・期間別の読書時間）関連の要素を取得しておく
const statsEmptyMessage = document.getElementById("stats-empty-message");
const statsContent = document.getElementById("stats-content");
const statsSpeedEl = document.getElementById("stats-speed");
const statsAvgSessionEl = document.getElementById("stats-avg-session");
const statsDayMinutesEl = document.getElementById("stats-day-minutes");
const statsWeekMinutesEl = document.getElementById("stats-week-minutes");
const statsMonthMinutesEl = document.getElementById("stats-month-minutes");
const statsYearMinutesEl = document.getElementById("stats-year-minutes");

// 2つの日付が同じ日かどうかを判定する
function isSameDay(date, reference) {
  return (
    date.getFullYear() === reference.getFullYear() &&
    date.getMonth() === reference.getMonth() &&
    date.getDate() === reference.getDate()
  );
}

// 2つの日付が同じ週（月曜始まり）かどうかを判定する
function isSameWeek(date, reference) {
  const startOfWeek = new Date(reference);
  const day = startOfWeek.getDay(); // 0(日)〜6(土)
  const diffToMonday = day === 0 ? 6 : day - 1;
  startOfWeek.setDate(startOfWeek.getDate() - diffToMonday);
  startOfWeek.setHours(0, 0, 0, 0);

  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(endOfWeek.getDate() + 7);

  return date >= startOfWeek && date < endOfWeek;
}

// 2つの日付が同じ月かどうかを判定する
function isSameMonth(date, reference) {
  return date.getFullYear() === reference.getFullYear() && date.getMonth() === reference.getMonth();
}

// 2つの日付が同じ年かどうかを判定する
function isSameYear(date, reference) {
  return date.getFullYear() === reference.getFullYear();
}

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

  // 期間（今日・今週・今月・今年）ごとの読書時間を合計する
  const now = new Date();
  let dayMinutes = 0;
  let weekMinutes = 0;
  let monthMinutes = 0;
  let yearMinutes = 0;

  allRecords.forEach(function (record) {
    if (!record.timestamp) {
      return; // timestampがない古い記録は、期間の判定ができないので集計から外す
    }
    const recordDate = new Date(record.timestamp);

    if (isSameDay(recordDate, now)) {
      dayMinutes += record.minutes;
    }
    if (isSameWeek(recordDate, now)) {
      weekMinutes += record.minutes;
    }
    if (isSameMonth(recordDate, now)) {
      monthMinutes += record.minutes;
    }
    if (isSameYear(recordDate, now)) {
      yearMinutes += record.minutes;
    }
  });

  statsDayMinutesEl.textContent = dayMinutes;
  statsWeekMinutesEl.textContent = weekMinutes;
  statsMonthMinutesEl.textContent = monthMinutes;
  statsYearMinutesEl.textContent = yearMinutes;

  trendAllRecords = allRecords;
  renderTrendChart(currentTrendPeriod);
}

// ---------- 読書時間の推移（棒グラフ・日/週/月/年の切り替え） ----------

const chartPeriodTabs = document.querySelectorAll(".chart-period-tab");
const trendChartBars = document.getElementById("trend-chart-bars");
const trendTooltip = document.getElementById("trend-tooltip");

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

  buckets.forEach(function (bucket) {
    const col = document.createElement("div");
    col.className = "trend-chart-col";

    const barWrapper = document.createElement("div");
    barWrapper.className = "trend-chart-bar-wrapper";

    const bar = document.createElement("div");
    bar.className = "trend-chart-bar";
    // 一番高いバーを100%とした割合で高さを決める（0分はバーが見えないよう高さ0のままにする）
    const heightPercent = maxMinutes > 0 && bucket.minutes > 0 ? (bucket.minutes / maxMinutes) * 100 : 0;
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

    barWrapper.appendChild(bar);
    col.appendChild(barWrapper);

    const labelEl = document.createElement("span");
    labelEl.className = "trend-chart-label";
    labelEl.textContent = bucket.label;
    col.appendChild(labelEl);

    trendChartBars.appendChild(col);
  });
}

// バーの上に、詳しいラベルと分数を表示するツールチップを出す
function showTrendTooltip(barEl, bucket) {
  trendTooltip.textContent = "";

  const valueEl = document.createElement("strong");
  valueEl.textContent = bucket.minutes + "分";
  trendTooltip.appendChild(valueEl);

  const labelEl = document.createElement("span");
  labelEl.textContent = bucket.fullLabel;
  trendTooltip.appendChild(labelEl);

  const barRect = barEl.getBoundingClientRect();
  const containerRect = trendChartBars.getBoundingClientRect();
  trendTooltip.style.left = (barRect.left - containerRect.left + barRect.width / 2) + "px";
  trendTooltip.style.top = (barRect.top - containerRect.top) + "px";
  trendTooltip.hidden = false;
}

// ツールチップを隠す
function hideTrendTooltip() {
  trendTooltip.hidden = true;
}

// タブ（日/週/月/年）が押されたら、その期間の棒グラフに切り替える
chartPeriodTabs.forEach(function (tab) {
  tab.addEventListener("click", function () {
    renderTrendChart(tab.dataset.period);
  });
});
