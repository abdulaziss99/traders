# XAU PRO — XAUUSD Trading Dashboard (PWA)

Dashboard trading XAUUSD lengkap: Dashboard, Trade (chart TradingView + RSI), Berita (AI News Engine), Kalender Ekonomi, dan Journal — jalan penuh di browser (HTML/CSS/JS murni), bisa di-install sebagai app (PWA) di HP maupun laptop.

## Cara pakai
1. Buka `index.html` (langsung double-click, atau upload semua file ke hosting statis apa saja: GitHub Pages, Netlify, Vercel, Cloudflare Pages, dsb — gratis semua).
2. **PWA harus dibuka lewat HTTPS (atau localhost)** supaya bisa di-install & service worker jalan. Kalau cuma dibuka dari file lokal (`file://`), app tetap jalan tapi fitur "install to home screen" & offline cache tidak aktif.
3. Di HP: buka di Chrome/Safari → menu → "Add to Home Screen" / "Install App".
4. Data journal otomatis tersimpan di `localStorage` browser kamu (per-device, tidak sinkron ke cloud).

## File yang ada
- `index.html` — struktur & style utama
- `app.js` — semua logic (dashboard, trade, berita, kalender, journal, chart, PWA)
- `manifest.json` + `sw.js` — konfigurasi PWA (installable + offline cache app shell)
- `icons/` — icon app 192px & 512px
- `XAUPRO_Journal_Template.xlsx` — **contoh file Excel** buat isi data trading kamu, lalu tinggal import lewat tab Journal → "Import Excel/CSV". Kolom: `tanggal, pair, direction, lot, entry, sl, tp, close, entrytime, closetime, notes`. Result & Profit dihitung otomatis.

## API Key (semua OPSIONAL — tanpa key pun app tetap full jalan pakai data demo)
Isi lewat ikon ⚙️ di pojok kanan atas. Key disimpan lokal di browser kamu, tidak dikirim ke server manapun selain langsung ke provider API-nya.

| Fitur | Provider | Free tier | Butuh untuk |
|---|---|---|---|
| Chart XAUUSD + RSI | TradingView widget | **Gratis, tanpa API key** | Sudah otomatis jalan |
| Berita real-time | [Marketaux](https://www.marketaux.com/) | 100 request/hari gratis | Kalau tidak diisi → pakai berita demo |
| Kalender ekonomi real-time | [Finnhub](https://finnhub.io/) | Gratis (60 call/menit) | Kalau tidak diisi → pakai kalender demo |
| Harga emas real-time tambahan (opsional) | [GoldAPI.io](https://www.goldapi.io/) | 100 request/bulan gratis | Belum dipakai aktif di kode, disiapkan untuk pengembangan lanjut |

> Catatan: NewsAPI.org sengaja tidak dipakai karena free tier-nya memblokir request langsung dari browser (CORS) di production. Marketaux & Finnhub dipilih karena mendukung request langsung dari client-side.

## Yang masih demo / simulasi (perlu data real kalau mau live beneran)
- **AI Analysis** di tab Trade: masih rule-based contoh statis (Trend/Confidence/Signal). Untuk versi real butuh data indikator live (EMA, DXY, yield) dari broker/data feed API (misalnya lewat Finnhub forex candles atau broker MT5/MT4 bridge).
- **Harga Bid/Ask, Spread, ATR, Pivot** di tab Trade: contoh statis. Untuk live butuh feed harga dari broker (MetaTrader API, cTrader Open API, atau data vendor berbayar).
- **Tombol BUY/SELL**: hanya demo UI (toast notifikasi), tidak eksekusi order beneran. Untuk eksekusi real butuh integrasi API broker (MT4/MT5, cTrader, OANDA API, dll — masing-masing broker beda syarat).

## Kustomisasi cepat
- Tema gelap/terang: tombol ☀️/🌙 di topbar.
- Ganti data seed jurnal awal: edit fungsi `seedJournal()` di `app.js`.
- Tambah sumber berita / kata kunci klasifikasi bullish-bearish: edit `NEWS_SOURCES`, `BULLISH_KEYWORDS`, `BEARISH_KEYWORDS` di `app.js`.
