import puppeteer from "puppeteer-core";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = "http://localhost:3000";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const join = await fetch(`${BASE}/api/players/join`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Alice", pin: "1234" }) }).then((r) => r.json());
const player = { id: join.id, name: join.name, pin: "1234" };
const live = await fetch(`${BASE}/api/live`).then((r) => r.json());
const openerId = live.matches[0].id;
// seed a couple of comments
await fetch(`${BASE}/api/matches/${openerId}/comments`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ playerId: player.id, pin: "1234", body: "Calling it now — Mexico win this 2-1 at the Azteca 🇲🇽" }) });
const bob = await fetch(`${BASE}/api/players/join`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Bob", pin: "1111" }) }).then((r) => r.json());
await fetch(`${BASE}/api/matches/${openerId}/comments`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ playerId: bob.id, pin: "1111", body: "No chance, South Africa nick a draw 😎" }) });

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1000, height: 1100, deviceScaleFactor: 1 });
await page.goto(BASE, { waitUntil: "networkidle0" });
await page.evaluate((p) => localStorage.setItem("wc-player", JSON.stringify(p)), player);

await page.goto(`${BASE}/predict`, { waitUntil: "networkidle0" });
await wait(600);
await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Bonus"); b?.click(); });
await wait(500);
await page.click('input[placeholder*="Search a player"]');
await wait(400);
await page.screenshot({ path: "/tmp/s-bonus-combo.png" });
console.log("s-bonus-combo.png");

await page.goto(`${BASE}/matches/${openerId}`, { waitUntil: "networkidle0" });
await wait(600);
await page.screenshot({ path: "/tmp/s-comments.png" });
console.log("s-comments.png");

await browser.close();
