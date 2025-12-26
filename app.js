/* BacktestLab MVP Replay App
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

  const speedSel = $("speed");
  const seedSel = $("seed");

  const hudIndex = $("hudIndex");
  const hudPrice = $("hudPrice");
  const hudOpenPL = $("hudOpenPL");

  const directionSel = $("direction");
  const riskInp = $("risk");
  const slRInp = $("slR");
  const tpRInp = $("tpR");
  const setupInp = $("setup");
  const notesInp = $("notes");

  const btnEnter = $("btnEnter");
  const btnClose = $("btnClose");

  const roEntry = $("roEntry");
  const roSL = $("roSL");
  const roTP = $("roTP");
  const roOpenR = $("roOpenR");

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

  function draw(candles, idx, trade) {
    const W = canvas.width;
    const H = canvas.height;

    ctx.clearRect(0, 0, W, H);

    // View window around idx
    const windowSize = 80;
    const start = Math.max(0, idx - windowSize + 1);
    const view = candles.slice(start, idx + 1);

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

      ctx.fillStyle = up ? "rgba(34,197,94,.70)" : "rgba(239,68,68,.70)";
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

  function currentPrice() {
    return candles[idx].close;
  }

  function setReadout() {
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
    const dir = trade.direction === "long" ? 1 : -1;
    const move = (p - trade.entry) * dir;
    return move / riskDist;
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

  function enterTrade() {
    if (trade && trade.isOpen) return;

    const direction = directionSel.value;
    const risk = Math.max(1, Number(riskInp.value || 25));
    const slR = Math.max(0.25, Number(slRInp.value || 1));
    const tpR = Math.max(0.25, Number(tpRInp.value || 2));

    const entry = currentPrice();

    // Define risk distance using a simple ATR-ish proxy from recent candles
    const lookback = 14;
    let avgRange = 0;
    for (let i = Math.max(0, idx - lookback + 1); i <= idx; i++) {
      avgRange += (candles[i].high - candles[i].low);
    }
    avgRange = avgRange / Math.min(lookback, idx + 1);
    const baseRiskDist = Math.max(avgRange * 0.6, 0.0004); // minimum distance

    const riskDist = baseRiskDist * slR;
    const dir = direction === "long" ? 1 : -1;

    const sl = entry - dir * riskDist;
    const tp = entry + dir * (riskDist * (tpR / slR));

    trade = {
      isOpen: true,
      direction,
      risk,
      slR,
      tpR,
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
    const riskDist = Math.abs(trade.entry - trade.sl);
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

  // ---------- Replay controls ----------
  function updateHUD() {
    const p = currentPrice();
    hudIndex.textContent = String(idx);
    hudPrice.textContent = p.toFixed(5);

    if (trade && trade.isOpen) {
      const openR = computeOpenR();
      const sign = openR > 0 ? "+" : "";
      hudOpenPL.textContent = `${sign}${openR.toFixed(2)}R`;
      hudOpenPL.style.color = openR >= 0 ? "rgba(34,197,94,.95)" : "rgba(239,68,68,.95)";
    } else {
      hudOpenPL.textContent = "—";
      hudOpenPL.style.color = "rgba(234,240,255,.68)";
    }
  }

  function step(dir) {
    idx = Math.min(candles.length - 1, Math.max(0, idx + dir));
    maybeAutoClose();
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
  setReadout();
  draw(candles, idx, trade);
  updateHUD();
  setTradingViewBadges();
})();
