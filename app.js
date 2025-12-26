/* BacktestLab MVP Playback App
   - Generates deterministic candle data by seed
   - Candle-by-candle stepping and playback speed
   - Trade engine scored in R (risk multiples)
   - Auto journal + analytics, stored in LocalStorage
*/

(function () {
  const $ = (id) => document.getElementById(id);

  // ---------- UI ----------
  const canvas = $("chart");
  const ctx = canvas.getContext("2d");

  const btnReset = $("btnReset");
  const btnPrev = $("btnPrev");
  const btnPlay = $("btnPlay");
  const btnNext = $("btnNext");
  const btnNextDay = $("btnNextDay");
  const btnNextSession = $("btnNextSession");
  const btnNYSession = $("btnNYSession");

  const speedSel = $("speed");
  const seedSel = $("seed");
  const backtestTypeSel = $("backtestType");
  const accountSizeInp = $("accountSize");

  const hudIndex = $("hudIndex");
  const hudPrice = $("hudPrice");
  const hudOpenPL = $("hudOpenPL");

  const directionSel = $("direction");
  const orderTypeSel = $("orderType");
  const portionInp = $("portion");
  const entryPriceInp = $("entryPrice");
  const stopPriceInp = $("stopPrice");
  const takeProfitInp = $("takeProfit");
  const setupInp = $("setup");
  const notesInp = $("notes");
  const autoBEInp = $("autoBE");

  const btnEnter = $("btnEnter");
  const btnClose = $("btnClose");

  const roEntry = $("roEntry");
  const roSL = $("roSL");
  const roTP = $("roTP");
  const roOpenR = $("roOpenR");
  const roAccount = $("roAccount");

  const btnClearJournal = $("btnClearJournal");
  const btnExport = $("btnExport");

  const journalTable = $("journalTable").querySelector("tbody");

  const stTrades = $("stTrades");
  const stWinRate = $("stWinRate");
  const stAvgR = $("stAvgR");
  const stExp = $("stExp");
  const stPF = $("stPF");
  const stDD = $("stDD");

  const speedTag = $("speedTag");
  const symbolTag = $("symbolTag");
  const tfTag = $("tfTag");

  const tvForm = $("tvForm");
  const tvSymbol = $("tvSymbol");
  const tvTf = $("tvTf");
  const bullColorInp = $("bullColor");
  const bearColorInp = $("bearColor");

  const DAY_LENGTH = 288; // 24h of 5m candles
  const SESSION_LENGTH = 72; // 6h blocks for "next session" jumps
  const NY_OFFSET = 156; // 13:00 session start in 5m candles (approx New York open)
  const SESSION_MARKERS = [
    { name: "London open", offset: minutesToIndex(3 * 60), label: "03:00", color: "rgba(94,234,212,.9)" },
    { name: "Asia open", offset: minutesToIndex(18 * 60 + 30), label: "18:30", color: "rgba(147,197,253,.9)" },
    { name: "New York open", offset: minutesToIndex(9 * 60 + 30), label: "09:30", color: "rgba(248,180,0,.9)" },
  ];

  // Tabs
  document.querySelectorAll(".tab").forEach((b) => {
    b.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((x) => x.classList.remove("active"));
      document.querySelectorAll(".tabpane").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      $("tab-" + b.dataset.tab).classList.add("active");
    });
  });

  // ---------- Storage ----------
  const STORE_KEY = "backtestlab_journal_v1";
  const ACCOUNT_KEY = "backtestlab_account_sizes_v1";
  const DEFAULT_ACCOUNT_SIZES = { playback: 10000, tradingview: 10000 };

  function loadJournal() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveJournal(rows) {
    localStorage.setItem(STORE_KEY, JSON.stringify(rows));
  }

  function loadAccountSizes() {
    try {
      const raw = localStorage.getItem(ACCOUNT_KEY);
      if (!raw) return { ...DEFAULT_ACCOUNT_SIZES };
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? { ...DEFAULT_ACCOUNT_SIZES, ...parsed } : { ...DEFAULT_ACCOUNT_SIZES };
    } catch {
      return { ...DEFAULT_ACCOUNT_SIZES };
    }
  }

  function saveAccountSizes(map) {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(map));
  }

  let accountSizes = loadAccountSizes();

  // ---------- Deterministic RNG ----------
  function hashSeed(str) {
    // Simple string hash -> uint32
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- Candle generation ----------
  function genCandles(seedName, count = 420) {
    const rand = mulberry32(hashSeed("BTL-" + seedName));
    let price = 1.0850 + (rand() - 0.5) * 0.01;

    const candles = [];
    for (let i = 0; i < count; i++) {
      const drift = (rand() - 0.5) * 0.0009;
      const vol = 0.0006 + rand() * 0.0009;

      const open = price;
      const mid = open + drift;
      const high = Math.max(open, mid) + rand() * vol;
      const low = Math.min(open, mid) - rand() * vol;
      const close = low + rand() * (high - low);

      candles.push({ open, high, low, close });
      price = close;
    }
    return candles;
  }

  // ---------- Chart rendering ----------
  function round5(x) {
    return Math.round(x * 100000) / 100000;
  }

  function toNumber(value, fallback) {
    const v = Number(value);
    return Number.isFinite(v) ? v : fallback;
  }

  function formatCurrency(value) {
    const abs = Math.abs(value);
    const formatted = abs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const sign = value < 0 ? "-" : "";
    return `${sign}$${formatted}`;
  }

  function colorWithAlpha(hex, alpha = 0.7) {
    const value = hex.replace("#", "");
    if (value.length === 3) {
      const [r, g, b] = value.split("").map((c) => parseInt(c + c, 16));
      return `rgba(${r},${g},${b},${alpha})`;
    }
    if (value.length === 6) {
      const r = parseInt(value.slice(0, 2), 16);
      const g = parseInt(value.slice(2, 4), 16);
      const b = parseInt(value.slice(4, 6), 16);
      return `rgba(${r},${g},${b},${alpha})`;
    }
    return hex;
  }

  function minutesToIndex(minutes) {
    return Math.round(minutes / 5);
  }

  function sessionMarkersInView(startIndex, endIndex) {
    const markers = [];
    const firstDay = Math.floor(startIndex / DAY_LENGTH) - 1; // include prior day for near-open views
    const lastDay = Math.floor(endIndex / DAY_LENGTH) + 1;

    for (let day = firstDay; day <= lastDay; day++) {
      const base = day * DAY_LENGTH;
      SESSION_MARKERS.forEach((m) => {
        const idx = base + m.offset;
        if (idx >= startIndex - DAY_LENGTH && idx <= endIndex + DAY_LENGTH) {
          markers.push({ ...m, index: idx });
        }
      });
    }
    return markers;
  }

  function draw(candles, idx, trade) {
    const W = canvas.width;
    const H = canvas.height;

    ctx.clearRect(0, 0, W, H);

    // View window around idx
    const windowSize = 80;
    const start = Math.max(0, idx - windowSize + 1);
    const view = candles.slice(start, idx + 1);
    const end = start + view.length - 1;

    // Price range
    let minP = Infinity, maxP = -Infinity;
    view.forEach((c) => {
      minP = Math.min(minP, c.low);
      maxP = Math.max(maxP, c.high);
    });

    // Padding
    const padY = (maxP - minP) * 0.15 || 0.001;
    minP -= padY;
    maxP += padY;

    const toY = (p) => {
      const t = (p - minP) / (maxP - minP);
      return H - (t * (H - 40) + 20);
    };

    // Grid
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "rgba(234,240,255,.08)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      const y = 20 + (i * (H - 40)) / 5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    // Candles
    const cw = Math.max(6, Math.floor(W / (view.length + 2)));
    const gap = Math.max(2, Math.floor(cw * 0.25));
    const bodyW = cw - gap;

    // Session open markers
    const markers = sessionMarkersInView(start, end);
    markers.forEach((m) => {
      if (m.index < 0 || m.index >= candles.length) return;
      const x = 20 + (m.index - start) * cw + bodyW / 2;

      ctx.save();
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = m.color;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.moveTo(x, 10);
      ctx.lineTo(x, H - 15);
      ctx.stroke();
      ctx.restore();

      const label = `${m.name} (${m.label})`;
      ctx.save();
      ctx.font = "11px ui-sans-serif, system-ui";
      const textWidth = ctx.measureText(label).width + 10;
      const labelX = Math.min(Math.max(x - textWidth / 2, 6), W - textWidth - 6);
      const labelY = 22;

      ctx.fillStyle = "rgba(15,23,42,0.85)";
      ctx.fillRect(labelX, labelY - 12, textWidth, 18);

      ctx.strokeStyle = m.color;
      ctx.lineWidth = 1;
      ctx.strokeRect(labelX, labelY - 12, textWidth, 18);

      ctx.fillStyle = "rgba(226,232,240,0.92)";
      ctx.fillText(label, labelX + 5, labelY + 2);
      ctx.restore();
    });

    for (let i = 0; i < view.length; i++) {
      const c = view[i];
      const x = 20 + i * cw;

      const up = c.close >= c.open;
      ctx.strokeStyle = "rgba(234,240,255,.55)";
      ctx.lineWidth = 2;

      // Wick
      ctx.beginPath();
      ctx.moveTo(x + bodyW / 2, toY(c.high));
      ctx.lineTo(x + bodyW / 2, toY(c.low));
      ctx.stroke();

      // Body
      const yOpen = toY(c.open);
      const yClose = toY(c.close);
      const yTop = Math.min(yOpen, yClose);
      const yBot = Math.max(yOpen, yClose);
      const h = Math.max(3, yBot - yTop);

      const bullishFill = colorWithAlpha(bullColor, 0.7);
      const bearishFill = colorWithAlpha(bearColor, 0.7);
      ctx.fillStyle = up ? bullishFill : bearishFill;
      ctx.fillRect(x, yTop, bodyW, h);

      // Current candle marker
      if (start + i === idx) {
        ctx.strokeStyle = "rgba(124,92,255,.85)";
        ctx.lineWidth = 2;
        ctx.strokeRect(x - 2, yTop - 2, bodyW + 4, h + 4);
      }
    }

    // Trade overlay lines
    if (trade && trade.isOpen) {
      const yEntry = toY(trade.entry);
      const ySL = toY(trade.sl);
      const yTP = toY(trade.tp);

      // entry
      ctx.strokeStyle = "rgba(234,240,255,.45)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, yEntry);
      ctx.lineTo(W, yEntry);
      ctx.stroke();

      // SL (bad)
      ctx.strokeStyle = "rgba(239,68,68,.65)";
      ctx.beginPath();
      ctx.moveTo(0, ySL);
      ctx.lineTo(W, ySL);
      ctx.stroke();

      // TP (good)
      ctx.strokeStyle = "rgba(34,197,94,.60)";
      ctx.beginPath();
      ctx.moveTo(0, yTP);
      ctx.lineTo(W, yTP);
      ctx.stroke();
    }

    // Price axis labels
    ctx.fillStyle = "rgba(234,240,255,.65)";
    ctx.font = "12px ui-sans-serif, system-ui";
    for (let i = 0; i < 6; i++) {
      const p = minP + (i * (maxP - minP)) / 5;
      const y = toY(p);
      ctx.fillText(round5(p).toFixed(5), W - 90, y + 4);
    }
  }

  // ---------- Trade engine ----------
  let candles = genCandles(seedSel.value);
  let idx = 40;

  let playing = false;
  let timer = null;

  let trade = null; // current open trade or null

  let bullColor = bullColorInp ? bullColorInp.value : "#22c55e";
  let bearColor = bearColorInp ? bearColorInp.value : "#ef4444";

  function currentPrice() {
    return candles[idx].close;
  }

  function setReadout() {
    if (roAccount) {
      roAccount.textContent = formatCurrency(getAccountSize());
    }

    if (!trade || !trade.isOpen) {
      roEntry.textContent = "—";
      roSL.textContent = "—";
      roTP.textContent = "—";
      roOpenR.textContent = "—";
      btnClose.disabled = true;
      return;
    }

    roEntry.textContent = trade.entry.toFixed(5);
    roSL.textContent = trade.sl.toFixed(5);
    roTP.textContent = trade.tp.toFixed(5);
    roOpenR.textContent = computeOpenR().toFixed(2);

    btnClose.disabled = false;
  }

  function computeOpenR() {
    if (!trade || !trade.isOpen) return 0;
    const p = currentPrice();
    const riskDist = Math.abs(trade.entry - trade.sl);
    const baseRisk = trade.initialRiskDist || riskDist;
    if (!baseRisk) return 0;
    const dir = trade.direction === "long" ? 1 : -1;
    const move = (p - trade.entry) * dir;
    return move / baseRisk;
  }

  function currentBacktestType() {
    return backtestTypeSel && backtestTypeSel.value ? backtestTypeSel.value : "playback";
  }

  function getAccountSize() {
    const t = currentBacktestType();
    const fallback = accountSizes[t] ?? DEFAULT_ACCOUNT_SIZES[t] ?? 10000;
    const value = accountSizeInp ? toNumber(accountSizeInp.value, fallback) : fallback;
    return Math.max(100, value);
  }

  function syncAccountSizeInput() {
    if (!accountSizeInp) return;
    const t = currentBacktestType();
    const size = accountSizes[t] ?? DEFAULT_ACCOUNT_SIZES[t] ?? 10000;
    accountSizeInp.value = size;
    setReadout();
    updateHUD();
  }

  function persistAccountSize() {
    const size = getAccountSize();
    const t = currentBacktestType();
    accountSizes = { ...accountSizes, [t]: size };
    try {
      saveAccountSizes(accountSizes);
    } catch {}
    setReadout();
    updateHUD();
  }

  function getPortion() {
    return Math.max(1, Math.min(100, toNumber(portionInp && portionInp.value, 25)));
  }

  function getRiskUnit() {
    return (getAccountSize() * getPortion()) / 100;
  }

  function maybeAutoClose() {
    if (!trade || !trade.isOpen) return;

    const c = candles[idx];
    // Use candle high/low to detect hits
    const hitSL = trade.direction === "long"
      ? c.low <= trade.sl
      : c.high >= trade.sl;

    const hitTP = trade.direction === "long"
      ? c.high >= trade.tp
      : c.low <= trade.tp;

    // If both hit same candle, assume SL first (conservative)
    if (hitSL && hitTP) {
      closeTrade(trade.sl, "SL (same candle)");
      return;
    }
    if (hitSL) {
      closeTrade(trade.sl, "SL");
      return;
    }
    if (hitTP) {
      closeTrade(trade.tp, "TP");
      return;
    }
  }

  function maybeAutoBreakeven() {
    if (!trade || !trade.isOpen || !trade.autoBE || trade.movedToBE) return;
    const openR = computeOpenR();
    if (openR >= 1) {
      trade.sl = trade.entry;
      trade.movedToBE = true;
    }
  }

  function enterTrade() {
    if (trade && trade.isOpen) return;

    const direction = directionSel.value;
    const orderType = orderTypeSel ? orderTypeSel.value : "market";
    const portion = getPortion();

    const manualEntry = toNumber(entryPriceInp && entryPriceInp.value, NaN);
    const entry = (orderType === "market" || !Number.isFinite(manualEntry))
      ? currentPrice()
      : manualEntry;

    // Define risk distance using a simple ATR-ish proxy from recent candles
    const lookback = 14;
    let avgRange = 0;
    for (let i = Math.max(0, idx - lookback + 1); i <= idx; i++) {
      avgRange += (candles[i].high - candles[i].low);
    }
    avgRange = avgRange / Math.min(lookback, idx + 1);
    const baseRiskDist = Math.max(avgRange * 0.6, 0.0004); // minimum distance

    const riskDist = baseRiskDist;
    const dir = direction === "long" ? 1 : -1;

    const userSL = toNumber(stopPriceInp && stopPriceInp.value, NaN);
    const userTP = toNumber(takeProfitInp && takeProfitInp.value, NaN);

    const sl = Number.isFinite(userSL) ? userSL : (entry - dir * riskDist);
    const tp = Number.isFinite(userTP) ? userTP : (entry + dir * (riskDist * 2));
    const initialRiskDist = Math.abs(entry - sl) || riskDist;

    trade = {
      isOpen: true,
      direction,
      orderType,
      portion,
      autoBE: autoBEInp ? !!autoBEInp.checked : false,
      movedToBE: false,
      initialRiskDist,
      entry,
      sl,
      tp,
      setup: (setupInp.value || "").trim(),
      notes: (notesInp.value || "").trim(),
      entryIndex: idx,
      openedAt: new Date().toISOString()
    };

    setReadout();
    draw(candles, idx, trade);
    updateHUD();
  }

  function closeTrade(exitPrice, reason) {
    if (!trade || !trade.isOpen) return;

    const dir = trade.direction === "long" ? 1 : -1;
    const riskDist = trade.initialRiskDist || Math.abs(trade.entry - trade.sl) || 1e-6;
    const r = ((exitPrice - trade.entry) * dir) / riskDist;

    const row = {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random(),
      direction: trade.direction,
      setup: trade.setup || "—",
      entry: trade.entry,
      exit: exitPrice,
      r: r,
      result: r > 0 ? "Win" : (r < 0 ? "Loss" : "Flat"),
      reason,
      entryIndex: trade.entryIndex,
      exitIndex: idx,
      openedAt: trade.openedAt,
      closedAt: new Date().toISOString(),
      notes: trade.notes
    };

    const journal = loadJournal();
    journal.push(row);
    saveJournal(journal);

    trade.isOpen = false;
    trade = null;

    setReadout();
    renderJournal();
    renderStats();
    draw(candles, idx, trade);
    updateHUD();
  }

  // ---------- Journal + stats ----------
  function renderJournal() {
    const journal = loadJournal();
    journalTable.innerHTML = "";

    journal.slice().reverse().forEach((t, i) => {
      const tr = document.createElement("tr");
      const rr = Number(t.r);

      let badgeClass = "badge-flat";
      if (rr > 0) badgeClass = "badge-good";
      if (rr < 0) badgeClass = "badge-bad";

      tr.innerHTML = `
        <td>${journal.length - i}</td>
        <td>${t.direction === "long" ? "Long" : "Short"}</td>
        <td title="${escapeHtml(t.notes || "")}">${escapeHtml(t.setup || "—")}</td>
        <td>${Number(t.entry).toFixed(5)}</td>
        <td>${Number(t.exit).toFixed(5)}</td>
        <td class="${badgeClass}">${rr.toFixed(2)}</td>
        <td class="${badgeClass}">${escapeHtml(t.result)}</td>
      `;
      journalTable.appendChild(tr);
    });
  }

  function renderStats() {
    const j = loadJournal();
    const n = j.length;

    stTrades.textContent = String(n);

    if (n === 0) {
      stWinRate.textContent = "0%";
      stAvgR.textContent = "0.00";
      stExp.textContent = "0.00";
      stPF.textContent = "—";
      stDD.textContent = "0.00";
      return;
    }

    const rs = j.map(x => Number(x.r));
    const wins = rs.filter(x => x > 0);
    const losses = rs.filter(x => x < 0);

    const winRate = (wins.length / n) * 100;
    const avgR = rs.reduce((a,b)=>a+b,0) / n;

    const grossWin = wins.reduce((a,b)=>a+b,0);
    const grossLossAbs = Math.abs(losses.reduce((a,b)=>a+b,0));
    const pf = grossLossAbs === 0 ? (grossWin > 0 ? Infinity : 0) : (grossWin / grossLossAbs);

    // Drawdown in cumulative R
    let cum = 0;
    let peak = 0;
    let maxDD = 0;
    for (const r of rs) {
      cum += r;
      if (cum > peak) peak = cum;
      const dd = peak - cum;
      if (dd > maxDD) maxDD = dd;
    }

    stWinRate.textContent = `${winRate.toFixed(0)}%`;
    stAvgR.textContent = avgR.toFixed(2);
    stExp.textContent = avgR.toFixed(2);
    stPF.textContent = (pf === Infinity) ? "∞" : pf.toFixed(2);
    stDD.textContent = maxDD.toFixed(2);
  }

  function exportCSV() {
    const j = loadJournal();
    if (j.length === 0) return;

    const header = ["direction","setup","entry","exit","r","result","reason","openedAt","closedAt","notes"];
    const rows = j.map(t => header.map(k => csvCell(t[k])));
    const csv = [header.join(","), ...rows.map(r => r.join(","))].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "backtestlab_journal.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);
  }

  function csvCell(v) {
    const s = (v === null || v === undefined) ? "" : String(v);
    const needsQuotes = /[",\n]/.test(s);
    const escaped = s.replace(/"/g, '""');
    return needsQuotes ? `"${escaped}"` : escaped;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (m) => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
    }[m]));
  }

  // ---------- TradingView bridge ----------
  function setTradingViewBadges() {
    if (symbolTag && tvSymbol) {
      const clean = (tvSymbol.value || "EURUSD").trim();
      symbolTag.textContent = clean.toUpperCase();
    }
    if (tfTag && tvTf) {
      const chosen = tvTf.selectedOptions && tvTf.selectedOptions[0];
      const label = chosen && chosen.dataset && chosen.dataset.label
        ? chosen.dataset.label
        : `${tvTf.value}m`;
      tfTag.textContent = label;
    }
  }

  function openTradingView() {
    if (!tvSymbol || !tvTf) return;
    const symbol = (tvSymbol.value || "EURUSD").trim();
    const interval = tvTf.value || "60";
    const url = `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}`;
    window.open(url, "_blank", "noopener");
  }

  // ---------- Playback controls ----------
  function updateHUD() {
    const p = currentPrice();
    hudIndex.textContent = String(idx);
    hudPrice.textContent = p.toFixed(5);

    if (trade && trade.isOpen) {
      const openR = computeOpenR();
      const sign = openR > 0 ? "+" : "";
      const openCash = openR * getRiskUnit();
      const cashSign = openCash > 0 ? "+" : "";
      hudOpenPL.textContent = `${sign}${openR.toFixed(2)}R (${cashSign}${formatCurrency(openCash)})`;
      hudOpenPL.style.color = openR >= 0 ? "rgba(34,197,94,.95)" : "rgba(239,68,68,.95)";
    } else {
      hudOpenPL.textContent = "—";
      hudOpenPL.style.color = "rgba(234,240,255,.68)";
    }
  }

  function jumpTo(targetIndex) {
    pause();
    const clamped = Math.max(0, Math.min(targetIndex, candles.length - 1));
    idx = clamped;
    maybeAutoClose();
    maybeAutoBreakeven();
    setReadout();
    draw(candles, idx, trade);
    updateHUD();
  }

  function goToNextDayOpen() {
    const dayStart = Math.floor(idx / DAY_LENGTH) * DAY_LENGTH;
    const nextDay = dayStart + DAY_LENGTH;
    jumpTo(nextDay);
  }

  function goToNextSession() {
    const nextSession = Math.floor(idx / SESSION_LENGTH + 1) * SESSION_LENGTH;
    jumpTo(nextSession);
  }

  function goToNYSession() {
    const dayStart = Math.floor(idx / DAY_LENGTH) * DAY_LENGTH;
    let target = dayStart + NY_OFFSET;
    if (idx >= target) target += DAY_LENGTH;
    jumpTo(target);
  }

  function updateColorSettings() {
    bullColor = bullColorInp && bullColorInp.value ? bullColorInp.value : "#22c55e";
    bearColor = bearColorInp && bearColorInp.value ? bearColorInp.value : "#ef4444";
    draw(candles, idx, trade);
  }

  function step(dir) {
    idx = Math.min(candles.length - 1, Math.max(0, idx + dir));
    maybeAutoClose();
    maybeAutoBreakeven();
    setReadout();
    draw(candles, idx, trade);
    updateHUD();
  }

  function setSpeedTag() {
    const v = Number(speedSel.value);
    speedTag.textContent = `Speed ${v}×`;
  }

  function play() {
    if (playing) return;
    playing = true;
    btnPlay.textContent = "Pause";

    const tick = () => {
      if (!playing) return;
      if (idx >= candles.length - 1) {
        pause();
        return;
      }
      step(+1);
      const speed = Number(speedSel.value);
      const baseMs = 350;
      const ms = Math.max(35, baseMs / speed);
      timer = setTimeout(tick, ms);
    };
    tick();
  }

  function pause() {
    playing = false;
    btnPlay.textContent = "Play";
    if (timer) clearTimeout(timer);
    timer = null;
  }

  function resetSession() {
    pause();
    candles = genCandles(seedSel.value);
    idx = 40;
    trade = null;
    setReadout();
    draw(candles, idx, trade);
    updateHUD();
  }

  // ---------- Events ----------
  btnReset.addEventListener("click", resetSession);
  btnPrev.addEventListener("click", () => step(-1));
  btnNext.addEventListener("click", () => step(+1));

  btnPlay.addEventListener("click", () => {
    if (playing) pause();
    else play();
  });

  speedSel.addEventListener("change", () => {
    setSpeedTag();
  });

  seedSel.addEventListener("change", resetSession);

  if (backtestTypeSel) backtestTypeSel.addEventListener("change", syncAccountSizeInput);
  if (accountSizeInp) accountSizeInp.addEventListener("change", persistAccountSize);

  if (btnNextDay) btnNextDay.addEventListener("click", goToNextDayOpen);
  if (btnNextSession) btnNextSession.addEventListener("click", goToNextSession);
  if (btnNYSession) btnNYSession.addEventListener("click", goToNYSession);

  if (bullColorInp) bullColorInp.addEventListener("input", updateColorSettings);
  if (bearColorInp) bearColorInp.addEventListener("input", updateColorSettings);

  btnEnter.addEventListener("click", enterTrade);
  btnClose.addEventListener("click", () => {
    if (!trade || !trade.isOpen) return;
    closeTrade(currentPrice(), "Manual close");
  });

  btnClearJournal.addEventListener("click", () => {
    saveJournal([]);
    renderJournal();
    renderStats();
  });

  btnExport.addEventListener("click", exportCSV);

  if (tvForm) {
    tvForm.addEventListener("submit", (e) => {
      e.preventDefault();
      openTradingView();
    });
  }

  if (tvSymbol) tvSymbol.addEventListener("input", setTradingViewBadges);
  if (tvTf) tvTf.addEventListener("change", setTradingViewBadges);

  // ---------- Init ----------
  setSpeedTag();
  renderJournal();
  renderStats();
  updateColorSettings();
  syncAccountSizeInput();
  setReadout();
  draw(candles, idx, trade);
  updateHUD();
  setTradingViewBadges();
})();
