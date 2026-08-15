import { expect, test } from "@playwright/test";

test("capture critical responsive widths", async ({ page }) => {
  await page.goto("/#/login");
  await page.getByLabel("Логин").fill("test.student");
  await page.getByLabel("Пароль").fill("Student-test-2026!");
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page.getByTestId("student-shell")).toBeVisible();
  for (const width of [360, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
    expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
    await page.screenshot({ path: `artifacts/phase9b/critical-student-home-${width}.png`, fullPage: true });
  }
});
