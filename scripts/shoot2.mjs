import puppeteer from "puppeteer-core";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = "http://localhost:3000";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const join = await fetch(`${BASE}/api/players/join`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: "Alice", pin: "1234" }),
}).then((r) => r.json());
const player = { id: join.id, name: join.name, pin: "1234" };

// First match id (the opener — Alice/Bob predicted it).
const live = await fetch(`${BASE}/api/live`).then((r) => r.json());
const openerId = live.matches[0].id;

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1000, height: 1500, deviceScaleFactor: 1 });
await page.goto(BASE, { waitUntil: "networkidle0" });
await page.evaluate((p) => localStorage.setItem("wc-player", JSON.stringify(p)), player);

// Matches page with standings expanded.
await page.goto(`${BASE}/matches`, { waitUntil: "networkidle0" });
await wait(900);
await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((x) => /group standings/i.test(x.textContent));
  b?.click();
});
await wait(500);
await page.screenshot({ path: "/tmp/matches-standings.png" });
console.log("matches-standings.png");

// Match detail (reveal everyone's picks).
await page.goto(`${BASE}/matches/${openerId}`, { waitUntil: "networkidle0" });
await wait(700);
await page.screenshot({ path: "/tmp/match-detail.png" });
console.log("match-detail.png");

// Leaderboard.
await page.goto(`${BASE}/leaderboard`, { waitUntil: "networkidle0" });
await wait(700);
await page.screenshot({ path: "/tmp/leaderboard2.png" });
console.log("leaderboard2.png");

await browser.close();
