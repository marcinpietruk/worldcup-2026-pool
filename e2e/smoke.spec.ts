import { test, expect } from "@playwright/test";

// Smoke test of the core flow: join → dashboard → predict → leaderboard.
// Idempotent: re-joining the same name+passcode just signs back in.
test("join, then navigate the app", async ({ page }) => {
  // Fresh context per test → localStorage already empty.
  await page.goto("/");
  await expect(page.getByText("Join the pool")).toBeVisible();

  await page.getByPlaceholder("e.g. Marcin").fill("E2E Tester");
  await page.getByPlaceholder(/word or numbers/i).fill("e2epass");
  await page.getByRole("button", { name: /Join \/ Sign in/ }).click();

  // Dashboard
  await expect(page.getByText(/Welcome back, E2E Tester/)).toBeVisible();

  // Predict (group stage)
  await page.goto("/predict");
  await expect(page.getByText("Predict the group stage")).toBeVisible();

  // Leaderboard
  await page.goto("/leaderboard");
  await expect(page.getByRole("heading", { name: "The Table" })).toBeVisible();
});

test("rules and matches pages render", async ({ page }) => {
  await page.goto("/rules");
  await expect(page.getByRole("heading", { name: "How it works" })).toBeVisible();

  await page.goto("/matches");
  await expect(page.getByRole("heading", { name: "Matches" })).toBeVisible();
});
