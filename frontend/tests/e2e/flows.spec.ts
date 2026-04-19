import { test, expect } from "@playwright/test";

test.describe("operator flows", () => {
  test("dashboard renders all Tier 1+2 panels", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Swarm signal ticker")).toBeVisible();
    await expect(page.getByText("Cross-chain flow")).toBeVisible();
    await expect(page.getByText("Circuit breaker")).toBeVisible();
    await expect(page.getByText("MCP tool-call heatmap")).toBeVisible();
    await expect(page.getByText("Determinism probe")).toBeVisible();
    await expect(page.getByText("DAO governance")).toBeVisible();
  });

  test("FSM simulator blocks a low-confidence signal", async ({ page }) => {
    await page.goto("/bridge/sim");

    // Drag the "confidence" slider to 0.20 — below the 0.50 floor.
    // Playwright can set <input type=range> values via `evaluate`.
    const sliders = page.locator('input[type="range"]');
    const count = await sliders.count();
    expect(count).toBeGreaterThanOrEqual(3);

    // The third slider is "confidence" based on page layout order.
    await sliders.nth(2).evaluate((el: HTMLInputElement) => {
      el.value = "0.20";
      el.dispatchEvent(new Event("input",  { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await expect(page.getByText(/confidence 0.20/i)).toBeVisible();
    await expect(page.getByText(/Rejected at/i)).toBeVisible();
  });

  test("risk simulator funnel updates when quorum changes", async ({ page }) => {
    await page.goto("/risk");

    const before = await page.getByText(/survive/i).first().innerText();

    const first = page.locator('input[type="range"]').first();
    await first.evaluate((el: HTMLInputElement) => {
      el.value = "95";
      el.dispatchEvent(new Event("input",  { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });

    // With a 95% quorum floor, the consensus row should drop sharply.
    const after = await page.getByText(/survive/i).first().innerText();
    expect(after).not.toEqual(before);
  });

  test("audit log browser filters and previews", async ({ page }) => {
    await page.goto("/audit");
    await expect(page.getByText("IPFS audit log · browser")).toBeVisible();
    const rows = page.getByRole("row");
    const initialCount = await rows.count();
    // pick the first data row (index 1 — row 0 is the header)
    await rows.nth(1).click();
    // A decoded payload preview block should appear
    await expect(page.locator("pre").first()).toBeVisible();
    expect(initialCount).toBeGreaterThan(1);
  });
});
