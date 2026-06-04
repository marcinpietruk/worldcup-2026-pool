import puppeteer from "puppeteer-core";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = "http://localhost:3000";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const join = await fetch(`${BASE}/api/players/join`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: "Alice", pin: "1234" }),
}).then((r) => r.json());
const player = { id: join.id, name: join.name, pin: "1234" };

const h2h = await fetch(`${BASE}/api/h2h`).then((r) => r.json());
const alice = h2h.players.find((p) => p.name === "Alice");
const bob = h2h.players.find((p) => p.name === "Bob");

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1000, height: 1400, deviceScaleFactor: 1 });
await page.goto(BASE, { waitUntil: "networkidle0" });
await page.evaluate((p) => localStorage.setItem("wc-player", JSON.stringify(p)), player);

await page.goto(`${BASE}/predict`, { waitUntil: "networkidle0" });
await wait(900);
await page.screenshot({ path: "/tmp/predict-joker.png" });
console.log("predict-joker.png");

await page.goto(`${BASE}/leaderboard`, { waitUntil: "networkidle0" });
await wait(700);
await page.screenshot({ path: "/tmp/leaderboard-badges.png" });
console.log("leaderboard-badges.png");

await page.goto(`${BASE}/h2h`, { waitUntil: "networkidle0" });
await wait(600);
const selects = await page.$$("select");
if (selects[0] && alice) await selects[0].select(alice.id);
if (selects[1] && bob) await selects[1].select(bob.id);
await wait(800);
await page.screenshot({ path: "/tmp/h2h.png" });
console.log("h2h.png");

await browser.close();
