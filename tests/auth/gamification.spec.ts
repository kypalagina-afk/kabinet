import { expect, test } from "@playwright/test";

test("student sees XP, level, streak and earned achievements", async ({ page }) => {
  await page.goto("/#/login");
  await page.getByLabel("Логин").fill("test.student");
  await page.getByLabel("Пароль").fill("Student-test-2026!");
  await page.getByRole("button", { name: "Войти" }).click();
  await page.getByRole("link", { name: "Профиль" }).click();

  await expect(page.getByRole("heading", { name: "Тестовая ученица" })).toBeVisible();
  await expect(page.getByText("150 XP", { exact: true })).toBeVisible();
  await expect(page.getByText(/Серия: 0/)).toBeVisible();
  await expect(page.getByTestId("achievement-grid").getByText("Первый шаг")).toBeVisible();
  await expect(page.getByTestId("achievement-grid").getByText("Боевое крещение")).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Новое достижение" })).toBeVisible();
  await page.getByRole("button", { name: "Отлично!" }).click();
  await expect(page.getByRole("dialog", { name: "Новое достижение" })).toBeHidden();
});
