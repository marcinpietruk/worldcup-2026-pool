import puppeteer from "puppeteer-core";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = "http://localhost:3000";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const join = await fetch(`${BASE}/api/players/join`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: "Alice", pin: "1234" }),
}).then((r) => r.json());
const player = { id: join.id, name: join.name, pin: "1234" };

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1100, height: 900, deviceScaleFactor: 1 });
await page.goto(BASE, { waitUntil: "networkidle0" });
await page.evaluate((p) => localStorage.setItem("wc-player", JSON.stringify(p)), player);

await page.goto(`${BASE}/predict`, { waitUntil: "networkidle0" });
await wait(700);
await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim().toLowerCase() === "bracket");
  b?.click();
});
await wait(800);
await page.screenshot({ path: "/tmp/bracket-empty.png" });
console.log("bracket-empty.png");

// Advance several R32 winners (click first slot of the first matches in column 1).
await page.evaluate(() => {
  const scroller = document.querySelector(".overflow-x-auto");
  const btns = scroller ? [...scroller.querySelectorAll("button")] : [];
  [0, 2, 4, 6, 8, 10, 12, 14].forEach((i) => btns[i]?.click());
});
await wait(600);
await page.screenshot({ path: "/tmp/bracket-advanced.png" });
console.log("bracket-advanced.png");

await browser.close();
