import { test, expect } from "@playwright/test";

test.describe("command palette", () => {
  test("⌘K opens and searches", async ({ page }) => {
    await page.goto("/");
    const isMac = (await page.evaluate(() => navigator.platform)).includes("Mac");
    const accel = isMac ? "Meta+k" : "Control+k";
    await page.keyboard.press(accel);

    const dialog = page.getByRole("dialog", { name: /command palette/i });
    await expect(dialog).toBeVisible();

    const input = dialog.getByPlaceholder(/Search pages/i);
    await input.fill("bridge sim");
    await expect(dialog.getByText(/FSM simulator/)).toBeVisible();

    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/bridge\/sim/);
  });

  test("/ also opens the palette outside of inputs", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("/");
    await expect(page.getByRole("dialog", { name: /command palette/i })).toBeVisible();
    await page.keyboard.press("Escape");
  });
});
