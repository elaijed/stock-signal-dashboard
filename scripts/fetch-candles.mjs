// Writes public/candles/<SYMBOL>.json (~10 months of daily closes + volume)
// for the hosted site, which has no server to proxy Yahoo Finance through.
// Run by .github/workflows/deploy.yml before each build (daily + on push).
// Tickers: the app's PICK_POOL, the S&P 500, popular ETFs/extras below, and
// any extra symbols listed one per line in tickers.txt.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";

const OUT = "public/candles";
const EXTRA = [
  "SPY", "QQQ", "DIA", "IWM", "VOO", "VTI", "VT", "VXUS", "ARKK", "SCHD", "XLK", "XLF", "XLE", "XLV",
  "SMH", "SOXX", "GLD", "SLV", "TLT", "BND", "COIN", "HOOD", "SOFI", "RIVN", "LCID", "NIO", "BABA",
  "TSM", "ASML", "ARM", "SMCI", "MSTR", "RBLX", "SNAP", "PINS", "SPOT", "SQ", "XYZ", "DKNG", "ROKU",
  "ZM", "DOCU", "NET", "DDOG", "MDB", "ZS", "OKTA", "TEAM", "WDAY", "TTD", "U", "AFRM", "UPST",
  "GME", "AMC", "BB", "NOK", "SIRI", "PLUG", "ENPH", "FSLR", "CCL", "AAL", "DAL", "UAL", "MRNA",
  "BNTX", "NVO", "SONY", "TM", "SHEL", "BP", "RY", "TD", "IONQ", "RGTI", "SOUN", "AI", "PATH",
];

const app = readFileSync("src/App.jsx", "utf8");
const pool = [...(app.match(/const PICK_POOL = \[([\s\S]*?)\];/)?.[1] ?? "").matchAll(/"([A-Z.\-]+)"/g)].map((m) => m[1]);

let sp500 = [];
try {
  const csv = await (await fetch("https://raw.githubusercontent.com/datasets/s-and-p-500-companies/main/data/constituents.csv")).text();
  sp500 = csv.split("\n").slice(1).map((l) => l.split(",")[0].trim()).filter((s) => /^[A-Z.\-]+$/.test(s));
} catch (e) {
  console.warn("S&P 500 list unavailable:", e.message);
}

const extraFile = existsSync("tickers.txt")
  ? readFileSync("tickers.txt", "utf8").split("\n").map((s) => s.trim().toUpperCase()).filter((s) => s && !s.startsWith("#"))
  : [];

const symbols = [...new Set([...pool, ...sp500, ...EXTRA, ...extraFile])];
console.log(`Fetching ${symbols.length} symbols (pool ${pool.length}, S&P ${sp500.length})`);
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(symbol) {
  const ysym = symbol.replace(/\./g, "-"); // BRK.B -> BRK-B on Yahoo
  for (const host of ["query1", "query2", "query1"]) {
    const res = await fetch(
      `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ysym)}?range=10mo&interval=1d`,
      { headers: { "User-Agent": "Mozilla/5.0" } }
    );
    if (res.status === 429) { await sleep(5000); continue; }
    if (!res.ok) return null;
    const r = (await res.json())?.chart?.result?.[0];
    const ts = r?.timestamp, q = r?.indicators?.quote?.[0];
    if (!Array.isArray(ts) || !Array.isArray(q?.close)) return null;
    const out = { t: [], c: [], v: [] };
    ts.forEach((t, i) => {
      if (q.close[i] == null) return;
      out.t.push(t);
      out.c.push(Math.round(q.close[i] * 10000) / 10000);
      out.v.push(q.volume?.[i] ?? 0);
    });
    return out.c.length >= 30 ? out : null;
  }
  return null;
}

let ok = 0;
const failed = [];
for (const s of symbols) {
  try {
    const data = await get(s);
    if (data) { writeFileSync(`${OUT}/${s}.json`, JSON.stringify(data)); ok++; }
    else failed.push(s);
  } catch {
    failed.push(s);
  }
  await sleep(250);
}
writeFileSync(`${OUT}/index.json`, JSON.stringify({ updated: new Date().toISOString(), symbols: symbols.filter((s) => !failed.includes(s)) }));
console.log(`Saved ${ok}/${symbols.length}. Failed: ${failed.join(" ") || "none"}`);
if (ok === 0) process.exit(1);
