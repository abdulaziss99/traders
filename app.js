/* ============================================================
   XAU PRO — XAUUSD Trading Dashboard
   Vanilla JS PWA. Data jurnal disimpan di localStorage +
   bisa import/export Excel (.xlsx/.csv) lewat SheetJS.
   ============================================================ */

/* ---------------- Config & State ---------------- */
const TABS = [
  { id: 'dashboard', num: 1, label: 'Dashboard', icon: '🏠' },
  { id: 'trade',     num: 2, label: 'Trade',     icon: '📈' },
  { id: 'berita',    num: 3, label: 'Berita',    icon: '📰' },
  { id: 'kalender',  num: 4, label: 'Kalender',  icon: '📅' },
  { id: 'journal',   num: 5, label: 'Journal',   icon: '📓' },
];

const LS_JOURNAL = 'xaupro_journal_v1';
const LS_KEYS    = 'xaupro_apikeys_v1';
const LS_THEME   = 'xaupro_theme_v1';

// Default API key bawaan (bisa diganti user lewat ⚙️ Pengaturan). Disimpan lokal di browser.
const DEFAULT_KEYS = {
  finnhub: 'd91knkpr01qqfqkcnrngd91knkpr01qqfqkcnro0',
  marketaux: 'PXpmSrBsqe9GLiJQHjJdSNRfTnKFoPD9z0ibBOEd',
  goldapi: '',
};

let state = {
  activeTab: 'dashboard',
  journal: [],
  keys: { marketaux: DEFAULT_KEYS.marketaux, finnhub: DEFAULT_KEYS.finnhub, goldapi: DEFAULT_KEYS.goldapi, sheetUrl: '' },
  newsFilter: 'ringkasan',
  calImpactFilter: 'all',
  calDate: new Date(),
  editingId: null,
  charts: {},
};

/* ---------------- Utilities ---------------- */
function uid() { return 'tr_' + Math.random().toString(36).slice(2, 10); }
function fmtMoney(n) {
  const s = n < 0 ? '-' : '';
  return s + '$' + Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
function fmtDateID(d) {
  const days = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
  const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}
function starString(n) { return '★'.repeat(n) + '☆'.repeat(5 - n); }
function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

/* ---------------- Storage ---------------- */
function loadJournal() {
  try {
    const raw = localStorage.getItem(LS_JOURNAL);
    if (raw) { state.journal = JSON.parse(raw); return; }
  } catch (e) {}
  state.journal = seedJournal();
  saveJournal();
}
function saveJournal() {
  localStorage.setItem(LS_JOURNAL, JSON.stringify(state.journal));
}
function loadKeys() {
  try {
    const raw = localStorage.getItem(LS_KEYS);
    if (raw) {
      const saved = JSON.parse(raw);
      // Cuma timpa default kalau user memang pernah isi/ubah key itu sendiri.
      Object.keys(saved).forEach(k => { if (saved[k]) state.keys[k] = saved[k]; });
    }
  } catch (e) {}
}
function saveKeys() {
  localStorage.setItem(LS_KEYS, JSON.stringify(state.keys));
}

function seedJournal() {
  // Data contoh awal (bisa dihapus/diedit user), sesuai referensi desain.
  return [
    { id: uid(), tanggal: '2026-06-07', pair: 'XAUUSD', direction: 'BUY',  lot:0.05, entry: 2340.50, sl: 2334.00, tp: 2360.00, close: 2350.20, entrytime:'09:12', closetime:'14:40', notes:'' , result:'WIN',  profit: 97.50 },
    { id: uid(), tanggal: '2026-06-06', pair: 'XAUUSD', direction: 'SELL', lot:0.05, entry: 2355.10, sl: 2362.00, tp: 2335.00, close: 2338.40, entrytime:'20:05', closetime:'23:50', notes:'' , result:'WIN',  profit: 167.30 },
    { id: uid(), tanggal: '2026-06-06', pair: 'XAUUSD', direction: 'BUY',  lot:0.05, entry: 2333.20, sl: 2328.00, tp: 2345.00, close: 2329.50, entrytime:'11:30', closetime:'12:20', notes:'' , result:'LOSS', profit: -37.80 },
    { id: uid(), tanggal: '2026-06-05', pair: 'XAUUSD', direction: 'BUY',  lot:0.05, entry: 2325.60, sl: 2318.00, tp: 2340.00, close: 2341.20, entrytime:'08:40', closetime:'10:55', notes:'' , result:'WIN',  profit: 133.20 },
    { id: uid(), tanggal: '2026-06-05', pair: 'XAUUSD', direction: 'SELL', lot:0.05, entry: 2348.90, sl: 2356.00, tp: 2330.00, close: 2356.30, entrytime:'19:15', closetime:'20:02', notes:'' , result:'LOSS', profit: -67.40 },
  ];
}

/* ---------------- Journal CRUD ---------------- */
function computeRR(sl, tp, entry, direction) {
  if (!sl || !tp || !entry) return 0;
  const risk = direction === 'BUY' ? entry - sl : sl - entry;
  const reward = direction === 'BUY' ? tp - entry : entry - tp;
  if (!risk) return 0;
  return Math.abs(reward / risk);
}
function computeProfit(entry, close, direction, lot) {
  const pips = direction === 'BUY' ? (close - entry) : (entry - close);
  // Simplified: XAUUSD 1.0 lot ~ $100 per $1 move -> pakai faktor 100 * lot
  return pips * 100 * (lot || 0.01) / 0.01 * 0.01; // keeps proportional; effectively pips*100*lot
}
function upsertTradeFromForm() {
  const tanggal = document.getElementById('f_tanggal').value;
  const pair = document.getElementById('f_pair').value || 'XAUUSD';
  const direction = document.getElementById('f_direction').value;
  const lot = parseFloat(document.getElementById('f_lot').value) || 0.01;
  const entry = parseFloat(document.getElementById('f_entry').value) || 0;
  const sl = parseFloat(document.getElementById('f_sl').value) || 0;
  const tp = parseFloat(document.getElementById('f_tp').value) || 0;
  const close = parseFloat(document.getElementById('f_close').value) || 0;
  const entrytime = document.getElementById('f_entrytime').value || '';
  const closetime = document.getElementById('f_closetime').value || '';
  const notes = document.getElementById('f_notes').value || '';

  if (!tanggal || !entry || !close) {
    toast('Lengkapi tanggal, entry & close ya pren.');
    return false;
  }
  const profit = +(computeProfit(entry, close, direction, lot)).toFixed(2);
  const result = profit >= 0 ? 'WIN' : 'LOSS';
  const rec = { tanggal, pair, direction, lot, entry, sl, tp, close, entrytime, closetime, notes, result, profit };

  if (state.editingId) {
    const idx = state.journal.findIndex(t => t.id === state.editingId);
    if (idx > -1) {
      state.journal[idx] = { ...state.journal[idx], ...rec };
      sheetPush('update', { trade: state.journal[idx] });
    }
  } else {
    const newTrade = { id: uid(), ...rec };
    state.journal.unshift(newTrade);
    sheetPush('add', { trade: newTrade });
  }
  saveJournal();
  return true;
}
function deleteTrade(id) {
  if (!confirm('Hapus trade ini dari journal?')) return;
  state.journal = state.journal.filter(t => t.id !== id);
  saveJournal();
  sheetPush('delete', { id });
  renderJournal();
  renderDashboard();
  toast('Trade dihapus.');
}

/* ---------------- Stats Engine ---------------- */
function computeStats(journal) {
  const n = journal.length;
  const wins = journal.filter(t => t.result === 'WIN');
  const losses = journal.filter(t => t.result === 'LOSS');
  const totalProfit = journal.reduce((s, t) => s + t.profit, 0);
  const grossWin = wins.reduce((s, t) => s + t.profit, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.profit, 0));
  const winRate = n ? (wins.length / n * 100) : 0;
  const profitFactor = grossLoss ? (grossWin / grossLoss) : (grossWin > 0 ? Infinity : 0);
  const bestWin = wins.length ? Math.max(...wins.map(t => t.profit)) : 0;
  const worstLoss = losses.length ? Math.min(...losses.map(t => t.profit)) : 0;
  const expectancy = n ? totalProfit / n : 0;
  const avgRR = n ? journal.reduce((s, t) => s + computeRR(t.sl, t.tp, t.entry, t.direction), 0) / n : 0;

  // Direction split
  const buyCount = journal.filter(t => t.direction === 'BUY').length;
  const sellCount = journal.filter(t => t.direction === 'SELL').length;

  // Equity curve (sorted by date ascending, cumulative)
  const sorted = [...journal].sort((a, b) => new Date(a.tanggal) - new Date(b.tanggal));
  let cum = 0;
  const equityLabels = [], equityData = [];
  sorted.forEach(t => { cum += t.profit; equityLabels.push(t.tanggal.slice(5)); equityData.push(+cum.toFixed(2)); });

  // Best/worst day by weekday aggregate
  const dayNames = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
  const byDay = {};
  journal.forEach(t => {
    const d = new Date(t.tanggal).getDay();
    byDay[d] = (byDay[d] || 0) + t.profit;
  });
  let bestDay = null, worstDay = null;
  Object.entries(byDay).forEach(([d, p]) => {
    if (bestDay === null || p > byDay[bestDay]) bestDay = d;
    if (worstDay === null || p < byDay[worstDay]) worstDay = d;
  });

  // Best trading hour (based on entrytime hour) if available
  const byHour = {};
  journal.forEach(t => {
    if (t.entrytime) {
      const h = parseInt(t.entrytime.split(':')[0], 10);
      byHour[h] = (byHour[h] || 0) + t.profit;
    }
  });
  let bestHour = null;
  Object.entries(byHour).forEach(([h, p]) => { if (bestHour === null || p > byHour[bestHour]) bestHour = h; });

  // Avg holding time (if entrytime & closetime present, same-day estimate)
  let holdMins = [], count = 0;
  journal.forEach(t => {
    if (t.entrytime && t.closetime) {
      const [eh, em] = t.entrytime.split(':').map(Number);
      const [ch, cm] = t.closetime.split(':').map(Number);
      let mins = (ch * 60 + cm) - (eh * 60 + em);
      if (mins < 0) mins += 24 * 60;
      holdMins.push(mins); count++;
    }
  });
  const avgHold = count ? holdMins.reduce((a, b) => a + b, 0) / count : null;

  // Streaks (based on chronological order)
  let maxWinStreak = 0, maxLoseStreak = 0, curW = 0, curL = 0;
  sorted.forEach(t => {
    if (t.result === 'WIN') { curW++; curL = 0; } else { curL++; curW = 0; }
    maxWinStreak = Math.max(maxWinStreak, curW);
    maxLoseStreak = Math.max(maxLoseStreak, curL);
  });

  return {
    n, wins: wins.length, losses: losses.length, totalProfit, winRate, profitFactor,
    bestWin, worstLoss, expectancy, avgRR, buyCount, sellCount,
    equityLabels, equityData, bestDay: bestDay !== null ? { name: dayNames[bestDay], profit: byDay[bestDay] } : null,
    worstDay: worstDay !== null ? { name: dayNames[worstDay], profit: byDay[worstDay] } : null,
    bestHour, avgHold, maxWinStreak, maxLoseStreak,
  };
}

/* ---------------- Navigation ---------------- */
function renderNav() {
  const topnav = document.getElementById('topnav');
  const bottomnav = document.getElementById('bottomnav');
  topnav.innerHTML = '';
  bottomnav.innerHTML = '';
  TABS.forEach(tab => {
    const tb = el(`<button data-tab="${tab.id}"><span class="num">${tab.num}</span> ${tab.label}</button>`);
    tb.addEventListener('click', () => switchTab(tab.id));
    topnav.appendChild(tb);

    const bb = el(`<button data-tab="${tab.id}"><span class="ic">${tab.icon}</span><span>${tab.label}</span></button>`);
    bb.addEventListener('click', () => switchTab(tab.id));
    bottomnav.appendChild(bb);
  });
  updateNavActive();
}
function updateNavActive() {
  document.querySelectorAll('.topnav button, .bottomnav button').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === state.activeTab);
  });
}
function switchTab(id) {
  state.activeTab = id;
  document.querySelectorAll('.panel-section').forEach(p => p.classList.toggle('active', p.id === 'panel-' + id));
  updateNavActive();
  // Lazy render heavy panels each time they're opened so data stays fresh
  if (id === 'dashboard') renderDashboard();
  if (id === 'trade') renderTrade();
  if (id === 'berita') renderBerita();
  if (id === 'kalender') renderKalender();
  if (id === 'journal') renderJournal();
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}

/* ---------------- Panel Skeletons ---------------- */
function buildSkeleton() {
  const main = document.getElementById('main');
  main.innerHTML = `
    <section class="panel-section" id="panel-dashboard"></section>
    <section class="panel-section" id="panel-trade"></section>
    <section class="panel-section" id="panel-berita"></section>
    <section class="panel-section" id="panel-kalender"></section>
    <section class="panel-section" id="panel-journal"></section>
  `;
  document.getElementById('panel-' + state.activeTab).classList.add('active');
}

/* ---------------- Dashboard ---------------- */
function renderDashboard() {
  const panel = document.getElementById('panel-dashboard');
  const s = computeStats(state.journal);
  const today = new Date();

  panel.innerHTML = `
    <div class="section-title">1. Dashboard <small>${fmtDateID(today)}</small></div>

    <div class="grid stats-grid" style="margin-bottom:12px;">
      <div class="stat">
        <div class="lbl">💰 Total Profit</div>
        <div class="val ${s.totalProfit>=0?'up':'down'}">${fmtMoney(s.totalProfit)}</div>
        <div class="sub up">${s.n} trade</div>
      </div>
      <div class="stat">
        <div class="lbl">🎯 Win Rate</div>
        <div class="val">${s.winRate.toFixed(2)}%</div>
        <div class="sub up">${s.wins}W / ${s.losses}L</div>
      </div>
      <div class="stat">
        <div class="lbl">📊 Total Trades</div>
        <div class="val">${s.n}</div>
        <div class="sub" style="color:var(--muted)">Semua data journal</div>
      </div>
      <div class="stat">
        <div class="lbl">⚖️ Profit Factor</div>
        <div class="val">${isFinite(s.profitFactor)? s.profitFactor.toFixed(2) : '∞'}</div>
        <div class="sub" style="color:var(--muted)">Gross win / gross loss</div>
      </div>
      <div class="stat">
        <div class="lbl">📐 Average RR</div>
        <div class="val">${s.avgRR.toFixed(2)}</div>
        <div class="sub" style="color:var(--muted)">Risk : Reward rata-rata</div>
      </div>
    </div>

    <div class="grid dash-mini-grid" style="margin-bottom:12px;">
      <div class="stat mini"><div class="lbl">Winning Trades</div><div class="val up">${s.wins} (${s.winRate.toFixed(2)}%)</div></div>
      <div class="stat mini"><div class="lbl">Losing Trades</div><div class="val down">${s.losses} (${(100-s.winRate).toFixed(2)}%)</div></div>
      <div class="stat mini"><div class="lbl">Best Win</div><div class="val up">${fmtMoney(s.bestWin)}</div></div>
      <div class="stat mini"><div class="lbl">Worst Loss</div><div class="val down">${fmtMoney(s.worstLoss)}</div></div>
      <div class="stat mini"><div class="lbl">Expectancy</div><div class="val ${s.expectancy>=0?'up':'down'}">${fmtMoney(s.expectancy)}</div></div>
      <div class="stat mini"><div class="lbl">Max Win / Lose Streak</div><div class="val">${s.maxWinStreak} / ${s.maxLoseStreak}</div></div>
    </div>

    <div class="grid dash-grid-3" style="margin-bottom:12px;">
      <div class="card">
        <div class="card-title">Equity Curve</div>
        <canvas id="chartEquity" height="150"></canvas>
      </div>
      <div class="card">
        <div class="card-title">Win vs Lose</div>
        <div class="donut-wrap">
          <canvas id="chartWinLose" width="110" height="110" style="max-width:110px;"></canvas>
          <div>
            <div class="legend-row"><span class="dot" style="background:var(--green)"></span>Win (${s.wins})</div>
            <div class="legend-row"><span class="dot" style="background:var(--red)"></span>Lose (${s.losses})</div>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-title">Trade Direction</div>
        <div class="donut-wrap">
          <canvas id="chartDirection" width="110" height="110" style="max-width:110px;"></canvas>
          <div>
            <div class="legend-row"><span class="dot" style="background:var(--blue)"></span>Buy (${s.buyCount})</div>
            <div class="legend-row"><span class="dot" style="background:var(--red)"></span>Sell (${s.sellCount})</div>
          </div>
        </div>
      </div>
    </div>

    <div class="grid dash-mini-grid">
      <div class="stat mini"><div class="lbl">Best Day</div><div class="val up">${s.bestDay ? s.bestDay.name : '-'}</div><div class="sub2">${s.bestDay ? 'Profit ' + fmtMoney(s.bestDay.profit) : 'Belum ada data'}</div></div>
      <div class="stat mini"><div class="lbl">Worst Day</div><div class="val down">${s.worstDay ? s.worstDay.name : '-'}</div><div class="sub2">${s.worstDay ? 'Loss ' + fmtMoney(s.worstDay.profit) : 'Belum ada data'}</div></div>
      <div class="stat mini"><div class="lbl">Best Trading Hour (WIB)</div><div class="val">${s.bestHour !== null ? s.bestHour + ':00 - ' + s.bestHour + ':59' : '-'}</div><div class="sub2">Isi jam entry di journal untuk hitung ini</div></div>
      <div class="stat mini"><div class="lbl">Avg Holding Time</div><div class="val">${s.avgHold !== null ? Math.floor(s.avgHold/60)+'h '+Math.round(s.avgHold%60)+'m' : '-'}</div><div class="sub2">Isi jam entry & close di journal</div></div>
      <div class="stat mini"><div class="lbl">Max Win Streak</div><div class="val up">${s.maxWinStreak}</div></div>
      <div class="stat mini"><div class="lbl">Max Lose Streak</div><div class="val down">${s.maxLoseStreak}</div></div>
    </div>
  `;

  drawDashboardCharts(s);
}

function destroyChart(key) {
  if (state.charts[key]) { state.charts[key].destroy(); delete state.charts[key]; }
}
function chartColors() {
  const light = document.documentElement.classList.contains('light');
  return { grid: light ? '#e3e6ee' : '#232838', text: light ? '#5c6478' : '#8891a7' };
}
function drawDashboardCharts(s) {
  const c = chartColors();
  destroyChart('equity');
  const ctxE = document.getElementById('chartEquity');
  if (ctxE) {
    state.charts.equity = new Chart(ctxE, {
      type: 'line',
      data: {
        labels: s.equityLabels.length ? s.equityLabels : ['-'],
        datasets: [{
          data: s.equityData.length ? s.equityData : [0],
          borderColor: '#f0b429', backgroundColor: 'rgba(240,180,41,.15)',
          fill: true, tension: .3, pointRadius: 0, borderWidth: 2,
        }]
      },
      options: {
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: c.grid }, ticks: { color: c.text, maxTicksLimit: 6 } },
          y: { grid: { color: c.grid }, ticks: { color: c.text } }
        }
      }
    });
  }
  destroyChart('winlose');
  const ctxW = document.getElementById('chartWinLose');
  if (ctxW) {
    state.charts.winlose = new Chart(ctxW, {
      type: 'doughnut',
      data: { labels: ['Win','Lose'], datasets: [{ data: [s.wins || 0, s.losses || 0], backgroundColor: ['#22c55e','#ef4444'], borderWidth: 0 }] },
      options: { cutout: '70%', plugins: { legend: { display: false }, tooltip: { enabled: true } } }
    });
  }
  destroyChart('direction');
  const ctxD = document.getElementById('chartDirection');
  if (ctxD) {
    state.charts.direction = new Chart(ctxD, {
      type: 'doughnut',
      data: { labels: ['Buy','Sell'], datasets: [{ data: [s.buyCount || 0, s.sellCount || 0], backgroundColor: ['#3b82f6','#ef4444'], borderWidth: 0 }] },
      options: { cutout: '70%', plugins: { legend: { display: false }, tooltip: { enabled: true } } }
    });
  }
}

/* ---------------- Trade Panel ---------------- */
let tvWidgetLoaded = false;
function renderTrade() {
  const panel = document.getElementById('panel-trade');
  panel.innerHTML = `
    <div class="section-title">2. Trade</div>
    <div class="trade-layout">
      <div>
        <div class="card">
          <div class="symbol-row">
            <div>
              <div style="font-size:12px;color:var(--muted);font-weight:700;">XAUUSD · Gold Spot / U.S. Dollar</div>
              <div class="px" id="tv_px">Lihat harga live di chart ↓</div>
            </div>
            <div class="chg" id="tv_chg" style="color:var(--muted);font-weight:700;font-size:11.5px;">Harga real-time ditampilkan langsung oleh TradingView di bawah</div>
          </div>
          <div id="tv_chart_container"><div id="tv_chart" style="width:100%;height:100%;"></div></div>
        </div>
        <div class="card" style="margin-top:12px;">
          <div class="card-title">Prediksi AI — Smart Money Concept <span class="badge-demo">Rule-based demo, bukan sinyal finansial</span></div>
          <div id="predictionBanner"></div>
        </div>
      </div>
      <div class="grid" style="gap:12px;">
        <div class="card">
          <div class="card-title">Live Clock <span class="badge-live">LIVE</span></div>
          <div class="clock-big" id="liveClock">--:--:--</div>
          <div class="clock-date" id="liveClockDate">-</div>
        </div>
        <div class="card">
          <div class="card-title">Market Session</div>
          <div class="session-list" id="sessionList"></div>
        </div>
        <div class="card">
          <div class="card-title">Volatility &amp; News</div>
          <div style="font-size:12.5px;color:var(--muted);margin-bottom:8px;">Volatility: <b class="gold-txt">HIGH ★★★★★</b></div>
          <div style="font-size:12px;color:var(--muted);">Next high impact: <b style="color:var(--text)">US CPI</b></div>
        </div>
      </div>
    </div>
  `;

  loadTradingViewWidget();
  renderSessionList();
  fetchLiveGoldPrice().then(renderPrediction);
  renderPrediction();
}

function loadTradingViewWidget() {
  const container = document.getElementById('tv_chart');
  if (!container) return;
  function build() {
    container.innerHTML = '';
    /* global TradingView */
    new TradingView.widget({
      autosize: true,
      symbol: 'OANDA:XAUUSD',
      interval: '60',
      timezone: 'Asia/Jakarta',
      theme: document.documentElement.classList.contains('light') ? 'light' : 'dark',
      style: '1',
      locale: 'id',
      toolbar_bg: '#12151c',
      enable_publishing: false,
      hide_top_toolbar: false,
      allow_symbol_change: true,
      studies: ['RSI@tv-basicstudies'],
      container_id: 'tv_chart',
    });
  }
  if (window.TradingView) { build(); return; }
  if (tvWidgetLoaded) return;
  tvWidgetLoaded = true;
  const s = document.createElement('script');
  s.src = 'https://s3.tradingview.com/tv.js';
  s.onload = build;
  s.onerror = () => { container.innerHTML = '<div style="padding:20px;color:#8891a7;font-size:13px;">Chart TradingView gagal dimuat (butuh koneksi internet ke tradingview.com).</div>'; };
  document.head.appendChild(s);
}

/* ---------------- Live Gold Price (opsional, via GoldAPI.io) ---------------- */
let goldPriceTimer = null;
async function fetchLiveGoldPrice() {
  clearInterval(goldPriceTimer);
  const pxEl = document.getElementById('tv_px');
  const chgEl = document.getElementById('tv_chg');
  if (!state.keys.goldapi) { state.liveGoldPrice = null; return; } // biarkan pesan default "Lihat harga live di chart"
  async function pull() {
    try {
      const res = await fetch('https://www.goldapi.io/api/XAU/USD', {
        headers: { 'x-access-token': state.keys.goldapi, 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!data.price) throw new Error('no price');
      state.liveGoldPrice = Number(data.price);
      if (pxEl) pxEl.textContent = Number(data.price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      if (chgEl) {
        const chg = data.ch ?? 0, chgP = data.chp ?? 0;
        chgEl.textContent = `${chg >= 0 ? '+' : ''}${chg.toFixed(2)} (${chgP >= 0 ? '+' : ''}${chgP.toFixed(2)}%)`;
        chgEl.style.color = chg >= 0 ? 'var(--green)' : 'var(--red)';
      }
      renderPrediction(); // refresh Entry/SL/TP begitu harga live baru datang
    } catch (e) {
      state.liveGoldPrice = null;
      if (pxEl) pxEl.textContent = 'Lihat harga live di chart ↓';
    }
  }
  await pull();
  goldPriceTimer = setInterval(pull, 60 * 1000); // hemat kuota, refresh tiap 1 menit
}

/* ---------------- Live Clock & Market Session ---------------- */
const SESSIONS = [
  { name: 'Sydney',   startUTC: 22, endUTC: 7  },
  { name: 'Tokyo',    startUTC: 0,  endUTC: 9  },
  { name: 'London',   startUTC: 8,  endUTC: 17 },
  { name: 'New York', startUTC: 13, endUTC: 22 },
];
function isSessionOpen(sess, utcHour) {
  if (sess.startUTC < sess.endUTC) return utcHour >= sess.startUTC && utcHour < sess.endUTC;
  return utcHour >= sess.startUTC || utcHour < sess.endUTC; // wraps midnight
}
function wibToUTCHourLabel(utcH) {
  const wibH = (utcH + 7) % 24;
  return String(wibH).padStart(2,'0') + ':00';
}
function renderSessionList() {
  const list = document.getElementById('sessionList');
  if (!list) return;
  const now = new Date();
  const utcHour = now.getUTCHours();
  list.innerHTML = SESSIONS.map(s => {
    const open = isSessionOpen(s, utcHour);
    return `<div class="srow">
      <div class="sname"><span class="sdot ${open?'open':'closed'}"></span>${s.name}</div>
      <div style="text-align:right;">
        <div>${wibToUTCHourLabel(s.startUTC)} - ${wibToUTCHourLabel(s.endUTC)}</div>
        <div class="${open?'stat-open':'stat-closed'}">${open?'OPEN':'CLOSED'}</div>
      </div>
    </div>`;
  }).join('');
}
function seededRandom(seedStr) {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) { h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}
function getWIBParts(now) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta', hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts = {};
  fmt.formatToParts(now).forEach(p => { if (p.type !== 'literal') parts[p.type] = p.value; });
  return parts;
}
function tickClock() {
  const now = new Date();
  const p = getWIBParts(now);
  const clockEl = document.getElementById('liveClock');
  const dateEl = document.getElementById('liveClockDate');
  if (clockEl) clockEl.textContent = `${p.hour}:${p.minute}:${p.second} WIB`;
  if (dateEl) {
    // Bikin Date lokal murni dari komponen Y-M-D Jakarta (tanpa jam) supaya nama hari akurat
    const wibDateOnly = new Date(Number(p.year), Number(p.month) - 1, Number(p.day));
    dateEl.textContent = fmtDateID(wibDateOnly);
  }
  if (state.activeTab === 'trade' && now.getSeconds() % 15 === 0) renderSessionList();
}
setInterval(tickClock, 1000);

/* ---------------- Prediksi AI — Smart Money Concept (SMC) style, rule-based demo ----------------
   Menggabungkan Trend/Confidence + setup trading konkret (Entry/SL/TP1/TP2) berdasarkan
   konsep SMC: struktur pasar (BOS/CHoCH), Order Block, Fair Value Gap (FVG), dan Support/Resistance.
   PENTING: ini simulasi/heuristik, BUKAN model ML yang beneran baca price action live —
   karena TradingView widget gratis gak expose data candle ke halaman ini. Kalau GoldAPI key
   diisi, angka Entry/SL/TP dihitung dari harga live sungguhan; kalau tidak, dari harga acuan
   demo yang ditandai jelas.
------------------------------------------------------------------------------------------------ */
function computeSMCSetup() {
  const isLive = typeof state.liveGoldPrice === 'number' && state.liveGoldPrice > 0;
  const refPrice = isLive ? state.liveGoldPrice : 2400.00; // harga acuan demo kalau belum ada live price

  // Seed berubah tiap jam WIB, jadi setup "napas" sepanjang hari tapi stabil dalam 1 jam yang sama.
  const p = getWIBParts(new Date());
  const rnd = seededRandom(`${p.year}${p.month}${p.day}${p.hour}`);

  const bosBullish = rnd() > 0.42; // bias struktur (Break of Structure)
  const direction = bosBullish ? 'BUY' : 'SELL';
  const confidence = 62 + Math.floor(rnd() * 26); // 62-88%

  // "ATR" harian simulasi buat nentuin lebar SL/TP & zona OB/FVG (dalam $ per oz)
  const atr = 9 + rnd() * 9; // 9-18

  let entry, sl, tp1, tp2, obLow, obHigh, fvgLow, fvgHigh, srLevel;
  if (bosBullish) {
    entry = refPrice;
    sl = +(entry - atr * 1.0).toFixed(2);
    tp1 = +(entry + atr * 1.5).toFixed(2);
    tp2 = +(entry + atr * 3.0).toFixed(2);
    obHigh = +(entry - atr * 0.15).toFixed(2);
    obLow = +(entry - atr * 0.45).toFixed(2);
    fvgHigh = +(entry - atr * 0.55).toFixed(2);
    fvgLow = +(entry - atr * 0.75).toFixed(2);
    srLevel = +(entry - atr * 1.2).toFixed(2);
  } else {
    entry = refPrice;
    sl = +(entry + atr * 1.0).toFixed(2);
    tp1 = +(entry - atr * 1.5).toFixed(2);
    tp2 = +(entry - atr * 3.0).toFixed(2);
    obLow = +(entry + atr * 0.15).toFixed(2);
    obHigh = +(entry + atr * 0.45).toFixed(2);
    fvgLow = +(entry + atr * 0.55).toFixed(2);
    fvgHigh = +(entry + atr * 0.75).toFixed(2);
    srLevel = +(entry + atr * 1.2).toFixed(2);
  }
  return { isLive, direction, confidence, entry, sl, tp1, tp2, obLow, obHigh, fvgLow, fvgHigh, srLevel };
}
function fmtPx(n) { return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

function renderPrediction() {
  const banner = document.getElementById('predictionBanner');
  if (!banner) return;
  const s = computeSMCSetup();
  const isBuy = s.direction === 'BUY';
  const rr1 = (Math.abs(s.tp1 - s.entry) / Math.abs(s.entry - s.sl)).toFixed(2);
  const rr2 = (Math.abs(s.tp2 - s.entry) / Math.abs(s.entry - s.sl)).toFixed(2);

  banner.innerHTML = `
    ${!s.isLive ? `<div style="font-size:11px;color:var(--gold);background:var(--gold-soft);border:1px solid rgba(240,180,41,.3);padding:7px 10px;border-radius:8px;margin-bottom:10px;">⚠️ Harga acuan masih demo (${fmtPx(s.entry)}). Isi <b>GoldAPI.io key</b> di ⚙️ Pengaturan supaya Entry/SL/TP dihitung dari harga live sungguhan.</div>` : ''}
    <div class="prediction-banner ${isBuy ? 'buy' : 'sell'}">
      <div>
        <div class="prediction-dir ${isBuy ? 'buy' : 'sell'}">${isBuy ? '▲ BUY' : '▼ SELL'}</div>
        <div class="prediction-meta">Struktur pasar: <b style="color:var(--text)">${isBuy ? 'Bullish BOS (Break of Structure)' : 'Bearish BOS (Break of Structure)'}</b> — H1</div>
        <div class="confidence-bar"><div class="confidence-fill ${isBuy ? 'buy' : 'sell'}" style="width:${s.confidence}%;"></div></div>
        <div class="prediction-meta">Confidence: <b style="color:var(--text)">${s.confidence}%</b></div>
      </div>
      <ul class="ai-reasons" style="min-width:220px;">
        <li>Order Block ${isBuy ? 'bullish' : 'bearish'}: $${fmtPx(Math.min(s.obLow,s.obHigh))} – $${fmtPx(Math.max(s.obLow,s.obHigh))}</li>
        <li>Fair Value Gap (FVG): $${fmtPx(Math.min(s.fvgLow,s.fvgHigh))} – $${fmtPx(Math.max(s.fvgLow,s.fvgHigh))}</li>
        <li>Key ${isBuy ? 'Support' : 'Resistance'}: $${fmtPx(s.srLevel)}</li>
        <li>Sentimen berita &amp; DXY mendukung bias ${isBuy ? 'bullish' : 'bearish'}</li>
      </ul>
    </div>
    <div class="grid smc-grid" style="margin-top:12px;">
      <div class="stat mini"><div class="lbl">Entry</div><div class="val">$${fmtPx(s.entry)}</div></div>
      <div class="stat mini"><div class="lbl">Stop Loss</div><div class="val down">$${fmtPx(s.sl)}</div></div>
      <div class="stat mini"><div class="lbl">TP 1 (1:${rr1})</div><div class="val up">$${fmtPx(s.tp1)}</div></div>
      <div class="stat mini"><div class="lbl">TP 2 (1:${rr2})</div><div class="val up">$${fmtPx(s.tp2)}</div></div>
    </div>
  `;
}

/* ---------------- Berita (AI News Engine) ---------------- */
const NEWS_SOURCES = {
  indonesia: [
    { name: 'Bloomberg Technoz', stars: 5 },
    { name: 'Detik Finance', stars: 4 },
    { name: 'CNBC Indonesia', stars: 5 },
    { name: 'Bisnis Indonesia', stars: 5 },
    { name: 'Kontan', stars: 4 },
    { name: 'IDX Channel', stars: 3 },
    { name: 'Antara Ekonomi', stars: 3 },
  ],
  global: [
    { name: 'Reuters', stars: 5 },
    { name: 'Bloomberg', stars: 5 },
    { name: 'Kitco', stars: 5 },
    { name: 'Investing.com', stars: 4 },
    { name: 'ForexLive', stars: 4 },
    { name: 'FXStreet', stars: 4 },
    { name: 'MarketWatch', stars: 3 },
    { name: 'TradingEconomics', stars: 5 },
  ],
};
function normalizeKey(s) { return (s || '').toLowerCase().replace(/^www\./, '').replace(/\.(com|co\.id|id|io)$/,'').replace(/[^a-z0-9]/g,''); }
function sourceStars(name) {
  const all = [...NEWS_SOURCES.indonesia, ...NEWS_SOURCES.global];
  const nk = normalizeKey(name);
  const f = all.find(s => { const sk = normalizeKey(s.name); return nk.includes(sk) || sk.includes(nk); });
  return f ? f.stars : 3;
}

// Kata kunci klasifikasi arah emas (Bullish/Bearish/Neutral) + skor dampak berita
const BULLISH_KEYWORDS = ['dovish','rate cut','pemangkasan suku bunga','dxy melemah','dollar melemah','yield turun','geopolitik','ketegangan','safe haven','inflasi turun'];
const BEARISH_KEYWORDS = ['hawkish','rate hike','kenaikan suku bunga','dxy menguat','dollar menguat','yield naik','nfp di atas ekspektasi','cpi naik','data kuat'];
const HIGH_IMPACT_KEYWORDS = ['fomc','non-farm payrolls','nfp','fed chair','powell','cpi'];
const MED_IMPACT_KEYWORDS = ['ppi','retail sales','gdp','pmi'];

function classifyNews(title) {
  const t = title.toLowerCase();
  const bull = BULLISH_KEYWORDS.some(k => t.includes(k));
  const bear = BEARISH_KEYWORDS.some(k => t.includes(k));
  if (bull && !bear) return 'bullish';
  if (bear && !bull) return 'bearish';
  return 'neutral';
}
function impactScore(title) {
  const t = title.toLowerCase();
  if (HIGH_IMPACT_KEYWORDS.some(k => t.includes(k))) return 5;
  if (MED_IMPACT_KEYWORDS.some(k => t.includes(k))) return 3;
  return 1;
}

function demoNews() {
  const base = [
    { title: 'The Fed Sinyalkan Pemangkasan Suku Bunga September', source: 'Bloomberg Technoz', region: 'indonesia', hoursAgo: 1 },
    { title: 'Emas Menguat di Tengah Melemahnya Dolar AS', source: 'CNBC Indonesia', region: 'indonesia', hoursAgo: 2 },
    { title: 'Data NFP AS di Bawah Ekspektasi, Emas Naik', source: 'Detik Finance', region: 'indonesia', hoursAgo: 4 },
    { title: 'Bank Dunia Turunkan Proyeksi Pertumbuhan Global', source: 'Bisnis Indonesia', region: 'indonesia', hoursAgo: 1.2 },
    { title: 'Rupiah Menguat, DXY Melemah ke 104.2', source: 'Detik Finance', region: 'indonesia', hoursAgo: 1.5 },
    { title: 'BI Pertahankan Suku Bunga Acuan di 6.25%', source: 'Kontan', region: 'indonesia', hoursAgo: 2.1 },
    { title: 'Harga Emas Antam Hari Ini Naik Rp4.000', source: 'Bisnis Indonesia', region: 'indonesia', hoursAgo: 2.5 },
    { title: 'IHSG Menguat Jelang Rilis Data Inflasi AS', source: 'IDX Channel', region: 'indonesia', hoursAgo: 2.8 },
    { title: 'Yield Obligasi AS 10 Tahun Turun di Bawah 4.30%', source: 'CNBC Indonesia', region: 'indonesia', hoursAgo: 0.4 },
    { title: 'Harga Emas Dunia Dibuka Menguat di Sesi Asia', source: 'Antara Ekonomi', region: 'indonesia', hoursAgo: 1.6 },
    { title: 'Emiten Tambang Emas RI Catat Kenaikan Produksi Q2', source: 'Kontan', region: 'indonesia', hoursAgo: 3.8 },
    { title: 'Bisnis Indonesia: Rupiah Ditutup Menguat 15 Poin', source: 'Bisnis Indonesia', region: 'indonesia', hoursAgo: 4.2 },
    { title: 'IDX Channel: Sentimen Fed Dominasi Perdagangan Hari Ini', source: 'IDX Channel', region: 'indonesia', hoursAgo: 5.1 },
    { title: 'Ketegangan Timur Tengah Dorong Permintaan Safe Haven', source: 'Reuters', region: 'global', hoursAgo: 3 },
    { title: 'Harga Emas Sentuh Level Tertinggi 2 Minggu', source: 'Kitco', region: 'global', hoursAgo: 5 },
    { title: 'Investor Global Alihkan Portofolio ke Aset Safe Haven', source: 'Bloomberg', region: 'global', hoursAgo: 0.6 },
    { title: 'Analis Kitco: Emas Berpotensi Uji Level $2,400', source: 'Kitco', region: 'global', hoursAgo: 0.8 },
    { title: 'Powell: The Fed Masih Data Dependent Soal Rate Cut', source: 'Reuters', region: 'global', hoursAgo: 1.1 },
    { title: 'ForexLive: DXY Tertekan Jelang Rilis CPI AS', source: 'ForexLive', region: 'global', hoursAgo: 1.3 },
    { title: 'FXStreet: Technical Outlook XAUUSD Masih Bullish', source: 'FXStreet', region: 'global', hoursAgo: 1.9 },
    { title: 'Klaim Pengangguran AS Naik Tipis Minggu Ini', source: 'Investing.com', region: 'global', hoursAgo: 2.3 },
    { title: 'PPI AS Sesuai Ekspektasi, Pasar Tenang', source: 'MarketWatch', region: 'global', hoursAgo: 2.6 },
    { title: 'TradingEconomics: Kalender Ekonomi Padat Pekan Ini', source: 'TradingEconomics', region: 'global', hoursAgo: 3.1 },
    { title: 'China Perlambatan Ekonomi Tekan Permintaan Komoditas', source: 'Bloomberg', region: 'global', hoursAgo: 3.4 },
    { title: 'Geopolitik Timur Tengah Memanas, Minyak & Emas Naik', source: 'Reuters', region: 'global', hoursAgo: 4.6 },
  ];
  // Geser sedikit "hoursAgo" tiap kali dipanggil biar kerasa "hidup" waktu refresh manual dipakai sebagai fallback
  return base.map(n => ({ ...n, hoursAgo: Math.max(0.1, n.hoursAgo + (Math.random()*0.4 - 0.2)), impact: impactScore(n.title), sentiment: classifyNews(n.title) }));
}

const REGION_DOMAINS = {
  indonesia: ['cnbcindonesia.com','bisnis.com','kontan.co.id','idxchannel.com','antaranews.com','detik.com','bloombergtechnoz.com'],
  global: ['reuters.com','bloomberg.com','kitco.com','investing.com','forexlive.com','fxstreet.com','marketwatch.com','tradingeconomics.com'],
};
// Satu kali fetch broad (tanpa filter domains/published_after yang sering bikin hasil kosong
// di paket gratis Marketaux), lalu diklasifikasi Indonesia/Global belakangan dari domain sumbernya.
let marketauxRawCache = null;
async function fetchMarketauxAll() {
  const key = state.keys.marketaux;
  if (!key) return null;
  try {
    const search = encodeURIComponent('gold OR XAUUSD OR emas OR "the fed" OR "federal reserve" OR dollar OR inflation OR "interest rate" OR rupiah');
    const url = `https://api.marketaux.com/v1/news/all?search=${search}&language=en,id&sort=published_desc&limit=50&api_token=${encodeURIComponent(key)}`;
    const res = await fetch(url);
    if (!res.ok) { console.error('Marketaux HTTP', res.status, await res.text().catch(()=> '')); return null; }
    const data = await res.json();
    if (data.error) { console.error('Marketaux API error:', data.error); return null; }
    if (!data.data || !data.data.length) return null;
    return data.data.map(a => ({
      title: a.title,
      source: (a.source || '').replace(/^www\./, '') || 'Marketaux',
      hoursAgo: Math.max(0.05, (Date.now() - new Date(a.published_at).getTime()) / 3600000),
      impact: impactScore(a.title),
      sentiment: classifyNews(a.title),
    }));
  } catch (e) { console.error('fetchMarketauxAll error', e); return null; }
}
async function fetchMarketauxRegion(region) {
  if (!marketauxRawCache) marketauxRawCache = await fetchMarketauxAll();
  if (!marketauxRawCache) return null;
  const domains = REGION_DOMAINS[region];
  const matched = marketauxRawCache.filter(n => domains.some(d => n.source.toLowerCase().includes(d.replace(/\.(com|co\.id)$/,''))));
  return matched.length ? matched.map(n => ({ ...n, region })) : null;
}

/* ---- Google News RSS (gratis, tanpa API key) — cadangan utama, terutama buat
   sumber Indonesia karena Marketaux gak nge-index media lokal Indonesia sama sekali.
   Dipanggil lewat CORS proxy publik karena Google News RSS gak kirim header CORS. ---- */
const CORS_PROXIES = [
  (u) => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u),
  (u) => 'https://corsproxy.io/?url=' + encodeURIComponent(u),
  (u) => 'https://r.jina.ai/' + u,
];
const GNEWS_SITE_FILTER = {
  indonesia: 'site:cnbcindonesia.com OR site:bisnis.com OR site:kontan.co.id OR site:idxchannel.com OR site:detik.com OR site:antaranews.com OR site:bloombergtechnoz.com',
  global: 'site:reuters.com OR site:bloomberg.com OR site:kitco.com OR site:investing.com OR site:forexlive.com OR site:fxstreet.com OR site:marketwatch.com',
};
async function fetchGoogleNewsRegion(region) {
  const query = region === 'indonesia'
    ? `(emas OR dolar OR "suku bunga" OR rupiah OR inflasi OR "the fed") (${GNEWS_SITE_FILTER.indonesia})`
    : `(gold OR XAUUSD OR "interest rate" OR "federal reserve" OR dollar) (${GNEWS_SITE_FILTER.global})`;
  const hl = region === 'indonesia' ? 'id' : 'en-US';
  const gl = region === 'indonesia' ? 'ID' : 'US';
  const ceid = region === 'indonesia' ? 'ID:id' : 'US:en';
  const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=${hl}&gl=${gl}&ceid=${ceid}`;

  for (const buildProxyUrl of CORS_PROXIES) {
    try {
      const res = await fetch(buildProxyUrl(rssUrl));
      if (!res.ok) continue;
      const text = await res.text();
      const xml = new DOMParser().parseFromString(text, 'text/xml');
      const items = Array.from(xml.querySelectorAll('item')).slice(0, 15);
      if (!items.length) continue;
      return items.map(it => {
        const rawTitle = it.querySelector('title')?.textContent || '';
        const sourceTag = it.querySelector('source')?.textContent || '';
        // Judul Google News RSS biasanya "Headline - Nama Sumber"
        const dashIdx = rawTitle.lastIndexOf(' - ');
        const title = sourceTag ? rawTitle : (dashIdx > -1 ? rawTitle.slice(0, dashIdx) : rawTitle);
        const source = sourceTag || (dashIdx > -1 ? rawTitle.slice(dashIdx + 3) : 'Google News');
        const pubDate = it.querySelector('pubDate')?.textContent;
        const hoursAgo = pubDate ? Math.max(0.05, (Date.now() - new Date(pubDate).getTime()) / 3600000) : 6;
        return { title, source, region, hoursAgo, impact: impactScore(title), sentiment: classifyNews(title) };
      });
    } catch (e) { console.error('fetchGoogleNewsRegion(' + region + ') proxy failed', e); }
  }
  return null;
}

let newsCache = null; // { indonesia: [...], global: [...] }
let newsLastFetch = 0;
async function getNews(forceRefresh) {
  const now = Date.now();
  if (!forceRefresh && newsCache && (now - newsLastFetch) < 5 * 60 * 1000) return newsCache;
  if (forceRefresh) marketauxRawCache = null; // paksa fetch ulang, jangan pakai cache lama

  // Coba Marketaux dulu (satu request, diklasifikasi belakangan), lalu Google News RSS sebagai cadangan
  const [mtxID, mtxGlobal] = await Promise.all([fetchMarketauxRegion('indonesia'), fetchMarketauxRegion('global')]);
  let liveID = (mtxID && mtxID.length >= 3) ? mtxID : null;
  let liveGlobal = (mtxGlobal && mtxGlobal.length >= 3) ? mtxGlobal : null;
  if (!liveID) liveID = await fetchGoogleNewsRegion('indonesia');
  if (!liveGlobal) liveGlobal = await fetchGoogleNewsRegion('global');

  const demo = demoNews();
  newsCache = {
    indonesia: (liveID && liveID.length >= 3) ? liveID : demo.filter(n => n.region === 'indonesia'),
    global: (liveGlobal && liveGlobal.length >= 3) ? liveGlobal : demo.filter(n => n.region === 'global'),
    liveID: !!(liveID && liveID.length >= 3),
    liveGlobal: !!(liveGlobal && liveGlobal.length >= 3),
  };
  newsLastFetch = now;
  return newsCache;
}

function overallSentiment(news) {
  const score = news.reduce((s, n) => s + (n.sentiment === 'bullish' ? n.impact : n.sentiment === 'bearish' ? -n.impact : 0), 0);
  if (score > 3) return 'bullish';
  if (score < -3) return 'bearish';
  return 'neutral';
}

async function renderBerita(forceRefresh) {
  const panel = document.getElementById('panel-berita');
  panel.innerHTML = `
    <div class="section-title" style="justify-content:space-between;flex-wrap:wrap;gap:8px;">
      <span>3. Berita <small id="newsStatusLabel">memuat...</small></span>
      <span style="display:flex;align-items:center;gap:10px;font-size:11px;color:var(--muted);font-weight:600;">
        <span id="newsUpdatedAt">Terakhir update: -</span>
        <button class="btn btn-outline btn-sm" id="btnRefreshNews">🔄 Refresh</button>
      </span>
    </div>
    <div class="news-tabs">
      <button data-f="ringkasan" class="active">Ringkasan AI</button>
      <button data-f="indonesia">Indonesia</button>
      <button data-f="global">Global</button>
      <button data-f="top">Top News</button>
    </div>
    <div id="newsBody"></div>
  `;
  panel.querySelectorAll('.news-tabs button').forEach(b => {
    b.onclick = () => {
      panel.querySelectorAll('.news-tabs button').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      state.newsFilter = b.dataset.f;
      paintNewsBody();
    };
  });
  document.getElementById('btnRefreshNews').onclick = async () => {
    const btn = document.getElementById('btnRefreshNews');
    btn.disabled = true; btn.textContent = '🔄 Memuat...';
    await renderBerita(true);
    toast('Berita diperbarui.');
  };

  const cache = await getNews(forceRefresh);
  const statusEl = document.getElementById('newsStatusLabel');
  if (statusEl) {
    const idLabel = cache.liveID ? 'Indonesia: live' : 'Indonesia: demo';
    const glLabel = cache.liveGlobal ? 'Global: live' : 'Global: demo';
    statusEl.textContent = `${idLabel} · ${glLabel} · auto-update tiap 5 menit`;
  }
  const updEl = document.getElementById('newsUpdatedAt');
  if (updEl) { const p = getWIBParts(new Date(newsLastFetch)); updEl.textContent = `Terakhir update: ${p.hour}:${p.minute}:${p.second} WIB`; }
  paintNewsBody();

  function paintNewsBody() {
    const body = document.getElementById('newsBody');
    if (!body) return;
    const all = [...cache.indonesia, ...cache.global];
    if (state.newsFilter === 'ringkasan') {
      const sent = overallSentiment(all);
      const driverRows = [
        ['Dollar Index', sent === 'bullish' ? 'Bearish' : sent === 'bearish' ? 'Bullish' : 'Neutral', 80],
        ['Bond Yield (US10Y)', sent === 'bullish' ? 'Bearish' : 'Neutral', 75],
        ['Geopolitical Risk', 'Bullish', 65],
        ['China Economy', 'Neutral', 40],
        ['Inflasi (US)', 'Neutral', 35],
      ];
      const top = [...all].sort((a,b) => b.impact - a.impact || a.hoursAgo - b.hoursAgo).slice(0,6);
      body.innerHTML = `
        <div class="grid" style="grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
          <div class="ai-summary-box">
            <div style="font-size:11px;color:var(--muted);font-weight:700;">RINGKASAN AI HARI INI</div>
            <div class="tag ${sent}">${sent === 'bullish' ? '🟢 BULLISH GOLD' : sent === 'bearish' ? '🔴 BEARISH GOLD' : '⚪ NEUTRAL GOLD'}</div>
            ${top.slice(0,4).map(n => `<div style="font-size:12px;color:var(--muted);padding:4px 0;">✔️ ${n.title}</div>`).join('')}
          </div>
          <div class="card" style="padding:12px;">
            <div class="card-title" style="margin-bottom:6px;">Market Driver</div>
            ${driverRows.map(r => `<div class="driver-row"><span>${r[0]}</span><span>${r[1]} <b style="color:var(--gold)">${r[2]}%</b></span></div>`).join('')}
          </div>
        </div>
        <div class="card">
          <div class="card-title">Top News (by Impact)</div>
          ${top.map((n,i) => newsItemHTML(n, i+1)).join('')}
        </div>
      `;
    } else if (state.newsFilter === 'top') {
      const top = [...all].sort((a,b) => b.impact - a.impact || a.hoursAgo - b.hoursAgo);
      body.innerHTML = `<div class="card">${top.map((n,i) => newsItemHTML(n,i+1)).join('')}</div>`;
    } else {
      const list = [...(state.newsFilter === 'indonesia' ? cache.indonesia : cache.global)].sort((a,b) => a.hoursAgo - b.hoursAgo);
      body.innerHTML = `<div class="card">${list.map((n,i) => newsItemHTML(n,i+1)).join('') || '<div style="padding:20px;text-align:center;color:var(--muted);">Belum ada berita.</div>'}</div>`;
    }
  }
}
function newsItemHTML(n, rank) {
  const stars = sourceStars(n.source);
  const impLabel = n.impact >= 5 ? 'high' : n.impact >= 3 ? 'medium' : 'low';
  const impText = n.impact >= 5 ? 'High Impact' : n.impact >= 3 ? 'Medium Impact' : 'Low Impact';
  const hrs = n.hoursAgo < 1 ? Math.round(n.hoursAgo*60)+'m ago' : Math.round(n.hoursAgo)+'h ago';
  return `<div class="news-item">
    <div class="rank">${rank}</div>
    <div class="body">
      <div class="headline">${n.title}</div>
      <div class="meta">
        <span>${n.source}</span>
        <span class="stars">${starString(stars)}</span>
        <span class="impact-chip ${impLabel}">${impText}</span>
        <span>${hrs}</span>
      </div>
    </div>
  </div>`;
}

// Auto-refresh berita tiap 5 menit biar selalu up-to-date
setInterval(() => { if (state.activeTab === 'berita') renderBerita(true); }, 5 * 60 * 1000);

/* ---------------- Kalender Ekonomi (TradingView Economic Calendar widget) ----------------
   Ganti dari Finnhub (yang free-tier-nya sering gak nyediain endpoint kalender ekonomi)
   ke widget resmi TradingView. Gratis, gak butuh API key, datanya beneran live dari mereka.
------------------------------------------------------------------------------------------- */
let tvCalendarLoaded = false;
function loadTVEconomicCalendar(importanceFilter) {
  const container = document.getElementById('tv_calendar');
  if (!container) return;
  container.innerHTML = `
    <div class="tradingview-widget-container" style="height:100%;width:100%;">
      <div class="tradingview-widget-container__widget"></div>
    </div>
  `;
  const widgetDiv = container.querySelector('.tradingview-widget-container__widget');
  const script = document.createElement('script');
  script.type = 'text/javascript';
  script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-events.js';
  script.async = true;
  script.innerHTML = JSON.stringify({
    colorTheme: document.documentElement.classList.contains('light') ? 'light' : 'dark',
    isTransparent: true,
    width: '100%',
    height: '100%',
    locale: 'in', // kode locale Bahasa Indonesia di TradingView
    importanceFilter: importanceFilter || '-1,0,1',
    countryFilter: 'us,eu,gb,jp,cn,id,au,ca,ch,nz',
  });
  widgetDiv.appendChild(script);
  tvCalendarLoaded = true;
}

async function renderKalender() {
  const panel = document.getElementById('panel-kalender');
  panel.innerHTML = `
    <div class="section-title">4. Ekonomi Kalender <small>live via TradingView · gratis, tanpa API key</small></div>
    <div class="cal-layout">
      <div class="card" style="padding:10px;">
        <div class="cal-toolbar" style="padding:0 4px;">
          <div style="font-size:11.5px;color:var(--muted);font-weight:700;">Filter dampak &amp; negara ada langsung di widget di bawah ⬇️</div>
          <div class="impact-filters" id="impactFilters">
            <button data-i="-1,0,1" class="active">All Impact</button>
            <button data-i="1"><span class="impact-dot" style="background:var(--red)"></span>High</button>
            <button data-i="0"><span class="impact-dot" style="background:var(--gold)"></span>Medium</button>
            <button data-i="-1"><span class="impact-dot" style="background:var(--green)"></span>Low</button>
          </div>
        </div>
        <div id="tv_calendar" style="height:600px;width:100%;"></div>
      </div>
      <div>
        <div class="card">
          <div class="card-title">AI Impact Guide</div>
          <div class="guide-card"><div class="g-title">📈 Actual &gt; Forecast</div><div class="g-sub">USD Menguat → Gold kemungkinan TURUN</div></div>
          <div class="guide-card"><div class="g-title">📉 Actual &lt; Forecast</div><div class="g-sub">USD Melemah → Gold kemungkinan NAIK</div></div>
          <div class="guide-card" style="margin-bottom:0;"><div class="g-title">➖ Actual = Forecast</div><div class="g-sub">Dampak Netral → Pergerakan terbatas</div></div>
        </div>
      </div>
    </div>
  `;

  panel.querySelectorAll('#impactFilters button').forEach(b => {
    b.onclick = () => {
      panel.querySelectorAll('#impactFilters button').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      loadTVEconomicCalendar(b.dataset.i);
    };
  });

  loadTVEconomicCalendar('-1,0,1');
}

/* ---------------- Google Sheet Sync (via Apps Script Web App) ----------------
   Lihat file google-apps-script/Code.gs untuk kode backend & cara deploy.
   Request POST dikirim dengan Content-Type: text/plain supaya tidak kena
   CORS preflight (Apps Script tidak bisa jawab OPTIONS request).
------------------------------------------------------------------------------ */
function sheetConfigured() { return !!(state.keys.sheetUrl && state.keys.sheetUrl.trim()); }

async function sheetFetchAll() {
  if (!sheetConfigured()) return null;
  try {
    const res = await fetch(state.keys.sheetUrl.trim());
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'unknown error');
    return data.trades.map(t => ({
      id: t.id || uid(),
      tanggal: String(t.tanggal),
      pair: t.pair || 'XAUUSD',
      direction: t.direction || 'BUY',
      lot: parseFloat(t.lot) || 0.01,
      entry: parseFloat(t.entry) || 0,
      sl: parseFloat(t.sl) || 0,
      tp: parseFloat(t.tp) || 0,
      close: parseFloat(t.close) || 0,
      entrytime: t.entrytime || '',
      closetime: t.closetime || '',
      notes: t.notes || '',
      result: t.result || (parseFloat(t.profit) >= 0 ? 'WIN' : 'LOSS'),
      profit: parseFloat(t.profit) || 0,
    }));
  } catch (e) {
    console.error('sheetFetchAll error', e);
    return null;
  }
}
async function sheetPush(action, payload) {
  if (!sheetConfigured()) return;
  try {
    await fetch(state.keys.sheetUrl.trim(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ action }, payload)),
    });
  } catch (e) {
    console.error('sheetPush error', e);
    toast('Gagal sync ke Google Sheet (cek koneksi / URL).');
  }
}
async function syncFromSheet(showToast) {
  if (!sheetConfigured()) { if (showToast) toast('Belum ada Google Sheet URL yang disambungkan.'); return; }
  const trades = await sheetFetchAll();
  if (trades === null) { if (showToast) toast('Gagal tarik data dari Sheet. Cek URL / deployment.'); return; }
  state.journal = trades;
  saveJournal();
  if (state.activeTab === 'journal') renderJournal();
  if (state.activeTab === 'dashboard') renderDashboard();
  if (showToast) toast(`${trades.length} trade ditarik dari Google Sheet.`);
}
async function pushAllToSheet() {
  if (!sheetConfigured()) return;
  await sheetPush('bulk_replace', { trades: state.journal });
}

/* ---------------- Journal Panel ---------------- */
function renderJournal() {
  const panel = document.getElementById('panel-journal');
  const s = computeStats(state.journal);
  const sheetOn = sheetConfigured();
  panel.innerHTML = `
    <div class="section-title" style="justify-content:space-between;flex-wrap:wrap;gap:8px;">
      <span>5. Journal</span>
      <span class="badge-demo" style="background:${sheetOn?'var(--green-soft)':'var(--panel-2)'};color:${sheetOn?'var(--green)':'var(--muted)'};">${sheetOn?'🔗 Google Sheet Connected':'💾 Local Storage Only'}</span>
    </div>
    <div class="journal-toolbar">
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn btn-gold" id="btnAddTrade">+ Tambah Trade</button>
        <button class="btn btn-outline" id="btnImportXlsx">⬆ Import Excel/CSV</button>
        <button class="btn btn-outline" id="btnExportXlsx">⬇ Export Excel</button>
        <button class="btn btn-outline" id="btnDownloadTemplate">📄 Download Template</button>
        <button class="btn btn-outline" id="btnSyncSheetJournal">🔄 Sync Sheet</button>
      </div>
      <div style="font-size:11.5px;color:var(--muted);">${sheetOn ? 'Data tersinkron ke Google Sheet kamu.' : 'Data tersimpan otomatis di perangkat kamu (localStorage). Sambungkan Google Sheet lewat ⚙️.'}</div>
    </div>
    <div class="card" style="margin-bottom:12px;">
      <div class="table-scroll">
        <table class="journal-table">
          <thead><tr>
            <th>Tanggal</th><th>Pair</th><th>Direction</th><th>Lot</th><th>Entry</th><th>SL</th><th>TP</th><th>Close</th><th>RR</th><th>Result</th><th>Profit</th><th>Aksi</th>
          </tr></thead>
          <tbody id="journalBody"></tbody>
        </table>
      </div>
    </div>
    <div class="card">
      <div class="card-title">Statistik Journal</div>
      <div class="grid dash-mini-grid">
        <div class="stat mini"><div class="lbl">Total Trades</div><div class="val">${s.n}</div></div>
        <div class="stat mini"><div class="lbl">Win Rate</div><div class="val">${s.winRate.toFixed(2)}%</div></div>
        <div class="stat mini"><div class="lbl">Total Profit</div><div class="val ${s.totalProfit>=0?'up':'down'}">${fmtMoney(s.totalProfit)}</div></div>
        <div class="stat mini"><div class="lbl">Average RR</div><div class="val">${s.avgRR.toFixed(2)}</div></div>
        <div class="stat mini"><div class="lbl">Best Win</div><div class="val up">${fmtMoney(s.bestWin)}</div></div>
        <div class="stat mini"><div class="lbl">Worst Loss</div><div class="val down">${fmtMoney(s.worstLoss)}</div></div>
      </div>
    </div>
  `;
  paintJournalBody();

  document.getElementById('btnAddTrade').onclick = () => openTradeModal();
  document.getElementById('btnImportXlsx').onclick = () => document.getElementById('importFile').click();
  document.getElementById('btnExportXlsx').onclick = exportJournalToExcel;
  document.getElementById('btnDownloadTemplate').onclick = downloadTemplate;
  document.getElementById('btnSyncSheetJournal').onclick = async () => {
    if (!sheetConfigured()) { toast('Sambungkan Google Sheet dulu lewat ⚙️ Pengaturan.'); openSettingsModal(); return; }
    await syncFromSheet(true);
  };
}
function paintJournalBody() {
  const body = document.getElementById('journalBody');
  if (!body) return;
  const sorted = [...state.journal].sort((a,b) => new Date(b.tanggal) - new Date(a.tanggal));
  body.innerHTML = sorted.map(t => `
    <tr>
      <td>${t.tanggal}</td>
      <td>${t.pair}</td>
      <td class="${t.direction==='BUY'?'dir-buy':'dir-sell'}">${t.direction}</td>
      <td>${(t.lot ?? 0.01).toFixed(2)}</td>
      <td>${t.entry.toFixed(2)}</td>
      <td>${t.sl.toFixed(2)}</td>
      <td>${t.tp.toFixed(2)}</td>
      <td>${t.close.toFixed(2)}</td>
      <td>1:${computeRR(t.sl,t.tp,t.entry,t.direction).toFixed(2)}</td>
      <td><span class="${t.result==='WIN'?'res-win':'res-loss'}">${t.result}</span></td>
      <td class="${t.profit>=0?'up':'down'}">${fmtMoney(t.profit)}</td>
      <td class="row-actions">
        <button title="Edit" onclick="openTradeModal('${t.id}')">✎</button>
        <button title="Hapus" onclick="deleteTrade('${t.id}')">🗑</button>
      </td>
    </tr>
  `).join('') || `<tr><td colspan="12" style="text-align:center;color:var(--muted);padding:24px;">Belum ada trade. Klik "+ Tambah Trade" atau import Excel.</td></tr>`;
}

function openTradeModal(id) {
  state.editingId = id || null;
  const t = id ? state.journal.find(x => x.id === id) : null;
  document.getElementById('tradeModalTitle').textContent = id ? '✎ Edit Trade' : '+ Tambah Trade';
  document.getElementById('f_tanggal').value = t ? t.tanggal : new Date().toISOString().slice(0,10);
  document.getElementById('f_pair').value = t ? t.pair : 'XAUUSD';
  document.getElementById('f_direction').value = t ? t.direction : 'BUY';
  document.getElementById('f_lot').value = t ? t.lot : 0.01;
  document.getElementById('f_entry').value = t ? t.entry : '';
  document.getElementById('f_sl').value = t ? t.sl : '';
  document.getElementById('f_tp').value = t ? t.tp : '';
  document.getElementById('f_close').value = t ? t.close : '';
  document.getElementById('f_entrytime').value = t ? (t.entrytime||'') : '';
  document.getElementById('f_closetime').value = t ? (t.closetime||'') : '';
  document.getElementById('f_notes').value = t ? (t.notes||'') : '';
  document.getElementById('tradeModalOverlay').classList.add('open');
}
function closeTradeModal() {
  document.getElementById('tradeModalOverlay').classList.remove('open');
  state.editingId = null;
}

/* ---------------- Excel Import / Export ---------------- */
const TEMPLATE_HEADERS = ['tanggal','pair','direction','lot','entry','sl','tp','close','entrytime','closetime','notes'];
function downloadTemplate() {
  const rows = [
    TEMPLATE_HEADERS,
    ['2026-06-07','XAUUSD','BUY',0.05,2340.50,2334.00,2360.00,2350.20,'09:12','14:40','contoh catatan'],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Journal Template');
  XLSX.writeFile(wb, 'XAUPRO_Journal_Template.xlsx');
  toast('Template Excel diunduh.');
}
function exportJournalToExcel() {
  const rows = [TEMPLATE_HEADERS.concat(['result','profit'])];
  state.journal.forEach(t => {
    rows.push([t.tanggal, t.pair, t.direction, t.lot, t.entry, t.sl, t.tp, t.close, t.entrytime||'', t.closetime||'', t.notes||'', t.result, t.profit]);
  });
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Journal');
  XLSX.writeFile(wb, `XAUPRO_Journal_${new Date().toISOString().slice(0,10)}.xlsx`);
  toast('Journal berhasil di-export.');
}
function handleImportFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const wb = XLSX.read(e.target.result, { type: 'binary' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
      let count = 0;
      rows.forEach(r => {
        const tanggal = normalizeDate(r.tanggal || r.Tanggal);
        const entry = parseFloat(r.entry ?? r.Entry);
        const close = parseFloat(r.close ?? r.Close);
        if (!tanggal || isNaN(entry) || isNaN(close)) return;
        const direction = String(r.direction ?? r.Direction ?? 'BUY').toUpperCase();
        const lot = parseFloat(r.lot ?? r.Lot) || 0.01;
        const sl = parseFloat(r.sl ?? r.SL) || 0;
        const tp = parseFloat(r.tp ?? r.TP) || 0;
        const profit = +(computeProfit(entry, close, direction, lot)).toFixed(2);
        state.journal.unshift({
          id: uid(), tanggal, pair: r.pair || r.Pair || 'XAUUSD', direction, lot, entry, sl, tp, close,
          entrytime: r.entrytime || r.Entrytime || '', closetime: r.closetime || r.Closetime || '',
          notes: r.notes || r.Notes || '', result: profit >= 0 ? 'WIN' : 'LOSS', profit,
        });
        count++;
      });
      saveJournal();
      renderJournal();
      renderDashboard();
      toast(`${count} trade berhasil diimport.`);
    } catch (err) {
      toast('Gagal membaca file. Pastikan format sesuai template.');
    }
  };
  reader.readAsBinaryString(file);
}
function normalizeDate(v) {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0,10);
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
  }
  const s = String(v).trim();
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0,10);
  return null;
}

/* ---------------- Settings Modal ---------------- */
function openSettingsModal() {
  document.getElementById('key_marketaux').value = state.keys.marketaux || '';
  document.getElementById('key_finnhub').value = state.keys.finnhub || '';
  document.getElementById('key_goldapi').value = state.keys.goldapi || '';
  document.getElementById('key_sheeturl').value = state.keys.sheetUrl || '';
  document.getElementById('settingsModalOverlay').classList.add('open');
}
function closeSettingsModal() { document.getElementById('settingsModalOverlay').classList.remove('open'); }

/* ---------------- Init & Event Wiring ---------------- */
function wireGlobalEvents() {
  document.getElementById('tradeCancelBtn').onclick = closeTradeModal;
  document.getElementById('tradeSaveBtn').onclick = () => {
    if (upsertTradeFromForm()) {
      closeTradeModal();
      renderJournal();
      renderDashboard();
      toast('Trade tersimpan.');
    }
  };
  document.getElementById('tradeModalOverlay').addEventListener('click', (e) => { if (e.target.id === 'tradeModalOverlay') closeTradeModal(); });

  document.getElementById('settingsBtn').onclick = openSettingsModal;
  document.getElementById('settingsCancelBtn').onclick = closeSettingsModal;
  document.getElementById('settingsModalOverlay').addEventListener('click', (e) => { if (e.target.id === 'settingsModalOverlay') closeSettingsModal(); });
  document.getElementById('settingsSaveBtn').onclick = async () => {
    state.keys.marketaux = document.getElementById('key_marketaux').value.trim();
    state.keys.finnhub = document.getElementById('key_finnhub').value.trim();
    state.keys.goldapi = document.getElementById('key_goldapi').value.trim();
    const prevSheetUrl = state.keys.sheetUrl;
    state.keys.sheetUrl = document.getElementById('key_sheeturl').value.trim();
    saveKeys();
    closeSettingsModal();
    toast('Pengaturan disimpan.');
    if (state.activeTab === 'berita') renderBerita(true);
    if (state.activeTab === 'kalender') renderKalender();
    if (state.keys.sheetUrl && state.keys.sheetUrl !== prevSheetUrl) {
      await syncFromSheet(true);
    }
  };
  document.getElementById('btnSyncFromSheet').onclick = async () => {
    const url = document.getElementById('key_sheeturl').value.trim();
    if (!url) { toast('Isi URL Google Apps Script dulu.'); return; }
    state.keys.sheetUrl = url;
    saveKeys();
    await syncFromSheet(true);
  };

  document.getElementById('importFile').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleImportFile(file);
    e.target.value = '';
  });

  document.getElementById('themeToggle').onclick = () => {
    document.documentElement.classList.toggle('light');
    const isLight = document.documentElement.classList.contains('light');
    localStorage.setItem(LS_THEME, isLight ? 'light' : 'dark');
    document.getElementById('themeToggle').textContent = isLight ? '🌙' : '☀️';
    if (state.activeTab === 'dashboard') renderDashboard();
    if (state.activeTab === 'trade') loadTradingViewWidget();
    if (state.activeTab === 'kalender') loadTVEconomicCalendar(document.querySelector('#impactFilters button.active')?.dataset.i || '-1,0,1');
  };
}

function init() {
  loadJournal();
  loadKeys();
  const savedTheme = localStorage.getItem(LS_THEME);
  if (savedTheme === 'light') {
    document.documentElement.classList.add('light');
    document.getElementById('themeToggle').textContent = '🌙';
  }
  renderNav();
  buildSkeleton();
  wireGlobalEvents();
  switchTab('dashboard');
  tickClock();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // Kalau Google Sheet sudah pernah disambungkan, tarik data terbaru otomatis.
  if (sheetConfigured()) {
    syncFromSheet(false).then(() => {
      if (state.activeTab === 'dashboard') renderDashboard();
    });
  }
}
document.addEventListener('DOMContentLoaded', init);
