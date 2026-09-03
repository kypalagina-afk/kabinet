import { expect, test } from "@playwright/test";

test("student sees a detailed 20/37 report and confidence-adjusted analytics", async ({ page }) => {
  await page.goto("/#/login");
  await page.getByLabel("Логин").fill("test.student");
  await page.getByLabel("Пароль").fill("Student-test-2026!");
  await page.getByRole("button", { name: "Войти" }).click();
  await page.getByRole("link", { name: "Прогресс", exact: true }).click();

  await expect(page.getByTestId("mock-analytics-dashboard")).toBeVisible();
  await expect(page.getByTestId("mock-exam-report")).toContainText("20/37");
  await expect(page.getByTestId("mock-exam-report")).toContainText("7/11");
  await expect(page.getByTestId("mock-exam-report")).toContainText("ГК2: 0/3 · ошибок 8");
  await expect(
    page.getByText("Процент показывает фактический средний результат", {
      exact: false,
    }),
  ).toBeVisible();
});
