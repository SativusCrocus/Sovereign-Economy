import { test, expect } from "@playwright/test";

test.describe("navigation", () => {
  test("loads the dashboard shell", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/DAES/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/Sovereign/);
    // The ticker panel is the first visibility panel on the dashboard.
    await expect(page.getByText("Swarm signal ticker")).toBeVisible();
  });

  test("top-level routes all render", async ({ page }) => {
    const routes = ["/", "/bridge", "/bridge/sim", "/archetypes", "/accounts", "/audit", "/risk", "/docs", "/design"];
    for (const r of routes) {
      const res = await page.goto(r);
      expect(res?.ok(), `${r} should return 2xx`).toBeTruthy();
    }
  });

  test("archetype deep-dive navigates", async ({ page }) => {
    await page.goto("/archetypes");
    await page.getByRole("link", { name: /Speculator/ }).first().click();
    await expect(page).toHaveURL(/\/archetypes\/speculator/i);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Speculator");
  });

  test("per-agent drill-down loads by id", async ({ page }) => {
    await page.goto("/swarm/agent-Sovereign-0011");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("agent-Sovereign-0011");
    await expect(page.getByText("Signer address")).toBeVisible();
  });

  test("404 on unknown agent id", async ({ page }) => {
    const res = await page.goto("/swarm/agent-Doesnotexist-0001");
    expect(res?.status()).toBe(404);
  });
});
