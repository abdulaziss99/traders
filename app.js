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

let state = {
  activeTab: 'dashboard',
  journal: [],
  keys: { marketaux: '', finnhub: '', goldapi: '' },
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
    if (raw) state.keys = Object.assign(state.keys, JSON.parse(raw));
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
    if (idx > -1) state.journal[idx] = { ...state.journal[idx], ...rec };
  } else {
    state.journal.unshift({ id: uid(), ...rec });
  }
  saveJournal();
  return true;
}
function deleteTrade(id) {
  if (!confirm('Hapus trade ini dari journal?')) return;
  state.journal = state.journal.filter(t => t.id !== id);
  saveJournal();
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
              <div class="px" id="tv_px">2,344.21</div>
            </div>
            <div class="chg up" id="tv_chg">+12.45 (+0.53%)</div>
          </div>
          <div id="tv_chart_container"><div id="tv_chart" style="width:100%;height:100%;"></div></div>
          <div class="tv-mini-stats">
            <div class="stat mini"><div class="lbl">Spread</div><div class="val">0.18</div></div>
            <div class="stat mini"><div class="lbl">ATR (14)</div><div class="val">18.45</div></div>
            <div class="stat mini"><div class="lbl">Pivot</div><div class="val">2,341.20</div></div>
            <div class="stat mini"><div class="lbl">High</div><div class="val up">2,347.11</div></div>
            <div class="stat mini"><div class="lbl">Low</div><div class="val down">2,335.42</div></div>
            <div class="stat mini"><div class="lbl">S1 / S2</div><div class="val">2,332.61 / 2,323.79</div></div>
          </div>
          <div class="order-row">
            <button class="order-btn sell" id="btnSell">SELL<small id="sellPx">2,344.03</small></button>
            <div class="lot-box">
              <div class="lot-val" id="lotVal">0.01</div>
              <div class="lot-lbl">LOT</div>
              <div class="lot-controls">
                <button id="lotMinus">−</button><button id="lotPlus">+</button>
              </div>
            </div>
            <button class="order-btn buy" id="btnBuy">BUY<small id="buyPx">2,344.21</small></button>
          </div>
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
          <div class="card-title">AI Analysis <span class="badge-demo">Rule-based demo</span></div>
          <div class="ai-box" id="aiBox"></div>
        </div>
        <div class="card">
          <div class="card-title">Volatility &amp; News</div>
          <div style="font-size:12.5px;color:var(--muted);margin-bottom:8px;">Volatility: <b class="gold-txt">HIGH ★★★★★</b></div>
          <div style="font-size:12px;color:var(--muted);">Next high impact: <b style="color:var(--text)">US CPI</b></div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('btnSell').onclick = () => toast('Order SELL (demo, tidak eksekusi ke broker).');
  document.getElementById('btnBuy').onclick = () => toast('Order BUY (demo, tidak eksekusi ke broker).');
  let lot = 0.01;
  document.getElementById('lotPlus').onclick = () => { lot = +(lot + 0.01).toFixed(2); document.getElementById('lotVal').textContent = lot.toFixed(2); };
  document.getElementById('lotMinus').onclick = () => { lot = Math.max(0.01, +(lot - 0.01).toFixed(2)); document.getElementById('lotVal').textContent = lot.toFixed(2); };

  loadTradingViewWidget();
  renderSessionList();
  renderAIAnalysis();
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
function tickClock() {
  const now = new Date();
  const wib = new Date(now.getTime() + (7*60 - now.getTimezoneOffset()) * 60000);
  const hh = String(wib.getHours()).padStart(2,'0');
  const mm = String(wib.getMinutes()).padStart(2,'0');
  const ss = String(wib.getSeconds()).padStart(2,'0');
  const clockEl = document.getElementById('liveClock');
  const dateEl = document.getElementById('liveClockDate');
  if (clockEl) clockEl.textContent = `${hh}:${mm}:${ss} WIB`;
  if (dateEl) dateEl.textContent = fmtDateID(now);
  if (state.activeTab === 'trade' && now.getSeconds() % 15 === 0) renderSessionList();
}
setInterval(tickClock, 1000);

/* ---------------- AI Analysis (rule-based demo) ---------------- */
function renderAIAnalysis() {
  const box = document.getElementById('aiBox');
  if (!box) return;
  // Simple demo rule-based signal (placeholder; ganti dengan data real jika API tersedia)
  const trend = 'BULLISH', confidence = 86, signal = 'BUY';
  box.innerHTML = `
    <div class="ai-row"><span>Trend</span><span class="pill bullish">${trend}</span></div>
    <div class="ai-row"><span>Confidence</span><b>${confidence}%</b></div>
    <div class="ai-row"><span>Signal</span><span class="pill bullish">${signal}</span></div>
    <ul class="ai-reasons">
      <li>EMA 50 &gt; EMA 200</li>
      <li>RSI di atas 50</li>
      <li>DXY melemah</li>
      <li>US10Y Yield turun</li>
    </ul>
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
function sourceStars(name) {
  const all = [...NEWS_SOURCES.indonesia, ...NEWS_SOURCES.global];
  const f = all.find(s => name.toLowerCase().includes(s.name.toLowerCase()));
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
    { title: 'The Fed Sinyalkan Pemangkasan Suku Bunga September', source: 'Bloomberg Technoz', hoursAgo: 1 },
    { title: 'Emas Menguat di Tengah Melemahnya Dolar AS', source: 'CNBC Indonesia', hoursAgo: 2 },
    { title: 'Ketegangan Timur Tengah Dorong Permintaan Safe Haven', source: 'Reuters', hoursAgo: 3 },
    { title: 'Data NFP AS di Bawah Ekspektasi, Emas Naik', source: 'Detik Finance', hoursAgo: 4 },
    { title: 'Harga Emas Sentuh Level Tertinggi 2 Minggu', source: 'Kitco', hoursAgo: 5 },
    { title: 'Bank Dunia Turunkan Proyeksi Pertumbuhan Global', source: 'Bisnis Indonesia', hoursAgo: 1.2 },
    { title: 'Rupiah Menguat, DXY Melemah ke 104.2', source: 'Detik Finance', hoursAgo: 1.5 },
    { title: 'Bi Pertahankan Suku Bunga Acuan di 6.25%', source: 'Kontan', hoursAgo: 2.1 },
    { title: 'Harga Emas Antam Hari Ini Naik Rp4.000', source: 'Bisnis Indonesia', hoursAgo: 2.5 },
    { title: 'IHSG Menguat Jelang Rilis Data Inflasi AS', source: 'IDX Channel', hoursAgo: 2.8 },
  ];
  return base.map(n => ({ ...n, impact: impactScore(n.title), sentiment: classifyNews(n.title) }));
}

async function fetchMarketauxNews() {
  const key = state.keys.marketaux;
  if (!key) return null;
  try {
    const url = `https://api.marketaux.com/v1/news/all?symbols=XAU,GOLD&filter_entities=true&language=en,id&api_token=${encodeURIComponent(key)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('bad response');
    const data = await res.json();
    if (!data.data) return null;
    return data.data.slice(0, 12).map(a => ({
      title: a.title,
      source: a.source || 'Marketaux',
      hoursAgo: Math.max(0.1, (Date.now() - new Date(a.published_at).getTime()) / 3600000),
      impact: impactScore(a.title),
      sentiment: classifyNews(a.title),
    }));
  } catch (e) { return null; }
}

let newsCache = null;
let newsLastFetch = 0;
async function getNews(forceRefresh) {
  const now = Date.now();
  if (!forceRefresh && newsCache && (now - newsLastFetch) < 5 * 60 * 1000) return newsCache;
  const live = await fetchMarketauxNews();
  newsCache = live || demoNews();
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
  const isDemo = !state.keys.marketaux;
  panel.innerHTML = `
    <div class="section-title">3. Berita <small>${isDemo ? 'mode demo — isi Marketaux API key di ⚙️ untuk data live' : 'live via Marketaux'}</small></div>
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

  const news = await getNews(forceRefresh);
  paintNewsBody();

  function paintNewsBody() {
    const body = document.getElementById('newsBody');
    if (!body) return;
    if (state.newsFilter === 'ringkasan') {
      const sent = overallSentiment(news);
      const driverRows = [
        ['Dollar Index', sent === 'bullish' ? 'Bearish' : sent === 'bearish' ? 'Bullish' : 'Neutral', 80],
        ['Bond Yield (US10Y)', sent === 'bullish' ? 'Bearish' : 'Neutral', 75],
        ['Geopolitical Risk', 'Bullish', 65],
        ['China Economy', 'Neutral', 40],
        ['Inflasi (US)', 'Neutral', 35],
      ];
      const top = [...news].sort((a,b) => b.impact - a.impact).slice(0,5);
      body.innerHTML = `
        <div class="grid" style="grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
          <div class="ai-summary-box">
            <div style="font-size:11px;color:var(--muted);font-weight:700;">RINGKASAN AI HARI INI</div>
            <div class="tag ${sent}">${sent === 'bullish' ? '🟢 BULLISH GOLD' : sent === 'bearish' ? '🔴 BEARISH GOLD' : '⚪ NEUTRAL GOLD'}</div>
            ${news.slice(0,4).map(n => `<div style="font-size:12px;color:var(--muted);padding:4px 0;">✔️ ${n.title}</div>`).join('')}
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
      const top = [...news].sort((a,b) => b.impact - a.impact);
      body.innerHTML = `<div class="card">${top.map((n,i) => newsItemHTML(n,i+1)).join('')}</div>`;
    } else {
      const srcList = state.newsFilter === 'indonesia' ? NEWS_SOURCES.indonesia.map(s=>s.name) : NEWS_SOURCES.global.map(s=>s.name);
      const filtered = news.filter(n => srcList.some(s => n.source.toLowerCase().includes(s.toLowerCase())));
      const list = filtered.length ? filtered : news;
      body.innerHTML = `<div class="card">${list.map((n,i) => newsItemHTML(n,i+1)).join('')}</div>`;
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

/* ---------------- Kalender Ekonomi ---------------- */
function demoCalendar(dateStr) {
  return [
    { time: '08:30', country: 'US', flag: '🇺🇸', event: 'Non-Farm Payrolls (May)', impact: 5, actual: '256K', forecast: '185K', previous: '175K', note: 'Actual > Forecast → USD Menguat → Gold kemungkinan TURUN' },
    { time: '10:00', country: 'US', flag: '🇺🇸', event: 'Unemployment Rate (May)', impact: 4, actual: '3.7%', forecast: '3.9%', previous: '3.9%', note: 'Actual < Forecast → USD Melemah → Gold kemungkinan NAIK' },
    { time: '19:30', country: 'US', flag: '🇺🇸', event: 'Average Hourly Earnings (MoM)', impact: 3, actual: '0.3%', forecast: '0.3%', previous: '0.4%', note: 'Sesuai ekspektasi → Dampak Netral' },
    { time: '20:30', country: 'US', flag: '🇺🇸', event: 'Fed Chair Powell Speech', impact: 5, actual: '-', forecast: '-', previous: '-', note: 'Volatilitas Tinggi → Waspada' },
    { time: '21:45', country: 'US', flag: '🇺🇸', event: 'FOMC Member Bowman Speech', impact: 3, actual: '-', forecast: '-', previous: '-', note: 'Volatilitas sedang' },
  ];
}
async function fetchFinnhubCalendar() {
  const key = state.keys.finnhub;
  if (!key) return null;
  try {
    const today = new Date().toISOString().slice(0,10);
    const url = `https://finnhub.io/api/v1/calendar/economic?from=${today}&to=${today}&token=${encodeURIComponent(key)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('bad');
    const data = await res.json();
    if (!data.economicCalendar) return null;
    return data.economicCalendar.map(e => ({
      time: (e.time || '').slice(11,16) || '--:--',
      country: e.country || '-', flag: '🌐', event: e.event || '-',
      impact: e.impact === 'high' ? 5 : e.impact === 'medium' ? 3 : 1,
      actual: e.actual ?? '-', forecast: e.estimate ?? '-', previous: e.prev ?? '-',
      note: 'Data dari Finnhub',
    }));
  } catch (e) { return null; }
}
function impactLabel(n) { return n>=5?'High':n>=3?'Medium':'Low'; }
function impactColor(n) { return n>=5?'var(--red)':n>=3?'var(--gold)':'var(--green)'; }

async function renderKalender() {
  const panel = document.getElementById('panel-kalender');
  const isDemo = !state.keys.finnhub;
  panel.innerHTML = `
    <div class="section-title">4. Ekonomi Kalender <small>${isDemo?'mode demo — isi Finnhub API key di ⚙️ untuk data live':'live via Finnhub'}</small></div>
    <div class="cal-layout">
      <div class="card">
        <div class="cal-toolbar">
          <div class="cal-nav">
            <button id="calPrev">‹</button>
            <button class="today-btn" id="calToday">Today</button>
            <button id="calNext">›</button>
            <b id="calDateLabel" style="margin-left:6px;font-size:13px;"></b>
          </div>
          <div class="impact-filters" id="impactFilters">
            <button data-i="all" class="active">All Impact</button>
            <button data-i="5"><span class="impact-dot" style="background:var(--red)"></span>High</button>
            <button data-i="3"><span class="impact-dot" style="background:var(--gold)"></span>Medium</button>
            <button data-i="1"><span class="impact-dot" style="background:var(--green)"></span>Low</button>
          </div>
        </div>
        <div class="table-scroll">
          <table class="cal-table">
            <thead><tr><th>Waktu (WIB)</th><th>Negara</th><th>Event</th><th>Dampak</th><th>Actual</th><th>Forecast</th><th>Previous</th></tr></thead>
            <tbody id="calBody"></tbody>
          </table>
        </div>
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

  document.getElementById('calDateLabel').textContent = fmtDateID(state.calDate);
  document.getElementById('calPrev').onclick = () => { state.calDate.setDate(state.calDate.getDate()-1); renderKalender(); };
  document.getElementById('calNext').onclick = () => { state.calDate.setDate(state.calDate.getDate()+1); renderKalender(); };
  document.getElementById('calToday').onclick = () => { state.calDate = new Date(); renderKalender(); };
  panel.querySelectorAll('#impactFilters button').forEach(b => {
    b.onclick = () => {
      panel.querySelectorAll('#impactFilters button').forEach(x=>x.classList.remove('active'));
      b.classList.add('active');
      state.calImpactFilter = b.dataset.i;
      paintCalBody(currentCalData);
    };
  });

  let currentCalData = (await fetchFinnhubCalendar()) || demoCalendar();
  paintCalBody(currentCalData);

  function paintCalBody(data) {
    const body = document.getElementById('calBody');
    if (!body) return;
    const filtered = state.calImpactFilter === 'all' ? data : data.filter(d => String(d.impact) === state.calImpactFilter);
    body.innerHTML = filtered.map(d => `
      <tr>
        <td><b>${d.time}</b></td>
        <td>${d.flag} ${d.country}</td>
        <td>
          <div>${'★'.repeat(Math.min(5,Math.ceil(d.impact))).padEnd(5,'☆')} ${d.event}</div>
          <div style="font-size:10.5px;color:var(--muted);margin-top:2px;">${d.note}</div>
        </td>
        <td><span class="impact-dot" style="background:${impactColor(d.impact)}"></span>${impactLabel(d.impact)}</td>
        <td>${d.actual}</td>
        <td>${d.forecast}</td>
        <td>${d.previous}</td>
      </tr>
    `).join('') || `<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:20px;">Tidak ada event untuk filter ini.</td></tr>`;
  }
}

/* ---------------- Journal Panel ---------------- */
function renderJournal() {
  const panel = document.getElementById('panel-journal');
  const s = computeStats(state.journal);
  panel.innerHTML = `
    <div class="section-title">5. Journal</div>
    <div class="journal-toolbar">
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn btn-gold" id="btnAddTrade">+ Tambah Trade</button>
        <button class="btn btn-outline" id="btnImportXlsx">⬆ Import Excel/CSV</button>
        <button class="btn btn-outline" id="btnExportXlsx">⬇ Export Excel</button>
        <button class="btn btn-outline" id="btnDownloadTemplate">📄 Download Template</button>
      </div>
      <div style="font-size:11.5px;color:var(--muted);">Data tersimpan otomatis di perangkat kamu (localStorage).</div>
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
  document.getElementById('settingsSaveBtn').onclick = () => {
    state.keys.marketaux = document.getElementById('key_marketaux').value.trim();
    state.keys.finnhub = document.getElementById('key_finnhub').value.trim();
    state.keys.goldapi = document.getElementById('key_goldapi').value.trim();
    saveKeys();
    closeSettingsModal();
    toast('API key disimpan di browser ini.');
    if (state.activeTab === 'berita') renderBerita(true);
    if (state.activeTab === 'kalender') renderKalender();
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
}
document.addEventListener('DOMContentLoaded', init);
