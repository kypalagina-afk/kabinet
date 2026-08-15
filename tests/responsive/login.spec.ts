import { expect, test } from "@playwright/test";

const requiredWidths = [360, 768, 1024, 1440] as const;

for (const width of requiredWidths) {
  test(`login fits the ${width}px viewport`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/#/login");

    await expect(page.getByRole("heading", { name: "Войти" })).toBeVisible();
    await expect(page.getByLabel("Логин")).toBeVisible();
    await expect(page.getByLabel("Пароль")).toBeVisible();
    await expect(page.locator("body")).not.toContainText("@kabinet25.example.com");

    const viewportMetrics = await page.evaluate(() => ({
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
    }));

    expect(viewportMetrics.documentWidth).toBeLessThanOrEqual(
      viewportMetrics.viewportWidth,
    );
    expect(viewportMetrics.bodyWidth).toBeLessThanOrEqual(viewportMetrics.viewportWidth);

    const panelBounds = await page.locator(".login-panel").evaluate((panel) => {
      const bounds = panel.getBoundingClientRect();
      return { left: bounds.left, right: bounds.right };
    });
    expect(panelBounds.left).toBeGreaterThanOrEqual(0);
    expect(panelBounds.right).toBeLessThanOrEqual(width);
  });
}
