import puppeteer from "puppeteer-core";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = "http://localhost:3000";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const join = await fetch(`${BASE}/api/players/join`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Alice", pin: "1234" }) }).then((r) => r.json());
const player = { id: join.id, name: join.name, pin: "1234" };

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1100, height: 1500, deviceScaleFactor: 1 });
await page.goto(BASE, { waitUntil: "networkidle0" });
await page.evaluate((p) => localStorage.setItem("wc-player", JSON.stringify(p)), player);

async function shot(path, name, clickText) {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle0" });
  await wait(700);
  if (clickText) {
    await page.evaluate((t) => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim().toLowerCase().includes(t)); b?.click(); }, clickText);
    await wait(900);
  }
  await page.screenshot({ path: `/tmp/${name}.png` });
  console.log(`${name}.png`);
}

await shot("/leaderboard", "s-leaderboard");
await shot("/matches", "s-matches", "show group standings");
await shot("/predict", "s-predict-scores");
await shot("/predict", "s-predict-bracket", "bracket");

// dark mode (home)
await page.goto(BASE, { waitUntil: "networkidle0" });
await page.evaluate(() => { localStorage.setItem("wc-theme", "dark"); document.documentElement.setAttribute("data-theme", "dark"); });
await wait(600);
await page.screenshot({ path: "/tmp/s-dark-home.png" });
console.log("s-dark-home.png");

await browser.close();
