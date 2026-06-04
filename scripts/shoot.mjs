import puppeteer from "puppeteer-core";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = "http://localhost:3000";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Ensure a player exists and grab its id.
const join = await fetch(`${BASE}/api/players/join`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: "Alice", pin: "1234" }),
}).then((r) => r.json());
const player = { id: join.id, name: join.name, pin: "1234" };

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1000, height: 1500, deviceScaleFactor: 1 });

// Seed localStorage on the right origin, then load Predict.
await page.goto(BASE, { waitUntil: "networkidle0" });
await page.evaluate((p) => localStorage.setItem("wc-player", JSON.stringify(p)), player);

await page.goto(`${BASE}/predict`, { waitUntil: "networkidle0" });
await wait(900);
await page.screenshot({ path: "/tmp/predict-matches.png" });
console.log("predict-matches.png");

// Switch to the Bracket tab.
await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim().toLowerCase() === "bracket");
  b?.click();
});
await wait(700);
await page.screenshot({ path: "/tmp/predict-bracket.png" });
console.log("predict-bracket.png");

// Admin: unlock then show results tab.
await page.goto(`${BASE}/admin`, { waitUntil: "networkidle0" });
await page.type('input[type="password"]', "changeme-admin");
await page.click('button[type="submit"]');
await wait(1200);
await page.screenshot({ path: "/tmp/admin.png" });
console.log("admin.png");

await browser.close();
