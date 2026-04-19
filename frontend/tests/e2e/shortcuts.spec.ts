import { test, expect } from "@playwright/test";

test.describe("keyboard shortcuts", () => {
  test("g b navigates to /bridge", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("g");
    await page.keyboard.press("b");
    await expect(page).toHaveURL(/\/bridge(?!\/sim)/);
  });

  test("g s navigates to /bridge/sim", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("g");
    await page.keyboard.press("s");
    await expect(page).toHaveURL(/\/bridge\/sim/);
  });

  test("? opens the shortcuts help overlay", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("?");
    await expect(page.getByRole("dialog", { name: /keyboard shortcuts/i })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: /keyboard shortcuts/i })).toHaveCount(0);
  });

  test("t toggles the theme", async ({ page }) => {
    await page.goto("/");
    const htmlEl = page.locator("html");
    await expect(htmlEl).not.toHaveClass(/\bdark\b/);
    await page.keyboard.press("t");
    await expect(htmlEl).toHaveClass(/\bdark\b/);
    await page.keyboard.press("t");
    await expect(htmlEl).not.toHaveClass(/\bdark\b/);
  });
});
