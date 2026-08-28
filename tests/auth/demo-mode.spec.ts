import { expect, test } from "@playwright/test";

test("demo teacher is visibly isolated and expensive mutations are disabled", async ({ page }) => {
  await page.goto("/#/login", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Логин").fill("demo.teacher");
  await page.getByLabel("Пароль").fill("Demo-teacher-2026!");
  await page.getByRole("button", { name: "Войти" }).click();

  await expect(page).toHaveURL(/#\/teacher$/);
  await expect(page.getByTestId("demo-mode-banner")).toContainText("Демо-режим");
  await expect(page.getByTestId("demo-mode-banner")).toContainText("12 запросов");

  await page.goto("/#/teacher/students");
  await expect(page.getByRole("button", { name: "+ Добавить ученика" })).toBeDisabled();
  await expect(page.getByText("В демо-режиме создание новых аккаунтов отключено.")).toBeVisible();

  await page.goto("/#/teacher/materials");
  await page.getByRole("button", { name: "+ Добавить материал" }).click();
  await expect(page.getByText("Загрузка файлов отключена в демо-режиме")).toBeVisible();
});
