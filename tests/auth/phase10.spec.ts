import { expect, test, type Page } from "@playwright/test";

async function loginTeacher(page: Page) {
  await page.goto("/#/login");
  await page.getByLabel("Логин").fill("test.teacher");
  await page.getByLabel("Пароль").fill("Teacher-test-2026!");
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page.getByTestId("teacher-shell")).toBeVisible();
}

test("global homework page uses the shared creation workflow", async ({ page }) => {
  await loginTeacher(page);
  await page.goto("/#/teacher/homeworks");
  await page.getByRole("button", { name: "+ Создать ДЗ" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Ученик")).toBeVisible();
  await dialog.getByLabel("Ученик").selectOption({ label: "Тестовая ученица" });
  await expect(dialog.getByTestId("homework-package-form")).toBeVisible();
});

test("planner combines lessons and private plans with CRUD and goals", async ({ page }) => {
  await loginTeacher(page);
  await page.goto("/#/teacher/planner");
  await expect(page.getByTestId("planner-day")).toBeVisible();
  await expect(page.getByText("Подготовить материалы к занятию")).toBeVisible();
  await expect(page.locator(".planner-entry--lesson").filter({ hasText: "Тестовая ученица" }).first()).toBeVisible();
  await expect(page.getByTestId("planner-someday")).toContainText("Обновить подборку диктантов");
  await expect(page.getByTestId("planner-goals")).toContainText("Сильный учебный месяц");

  const focusDate = await page.getByLabel("Дата планера").inputValue();
  await page.getByRole("button", { name: `Добавить на ${focusDate} в 15:00` }).click();
  let dialog = page.getByRole("dialog", { name: "Новый пункт плана" });
  await dialog.getByLabel("Название").fill("Личная встреча");
  await dialog.getByLabel("Время окончания").fill("16:00");
  await dialog.getByRole("button", { name: "Добавить" }).click();
  await expect(page.getByText("15:00 · Личная встреча")).toBeVisible();

  await page.getByRole("button", { name: "+ Задача без времени" }).click();
  dialog = page.getByRole("dialog", { name: "Новый пункт плана" });
  await dialog.getByLabel("Название").fill("Проверить сочинения");
  await dialog.getByLabel("Категория").selectOption("home");
  await dialog.getByRole("button", { name: "Добавить" }).click();
  const task = page.locator(".planner-entry").filter({ hasText: "Проверить сочинения" });
  await expect(task).toBeVisible();
  await task.getByRole("button", { name: "Выполнить задачу" }).click();
  await expect(task).toHaveClass(/planner-entry--done/);

  await page.getByTestId("planner-someday").getByRole("button", { name: "Завтра" }).click();
  await expect(page.getByTestId("planner-someday")).not.toContainText("Обновить подборку диктантов");

  await page.getByRole("button", { name: "+ Большая цель" }).click();
  dialog = page.getByRole("dialog", { name: "Большая цель" });
  await dialog.getByLabel("Название").fill("Запустить новый курс");
  await dialog.getByRole("button", { name: "Создать цель" }).click();
  const goal = page.locator(".planner-goal").filter({ hasText: "Запустить новый курс" });
  await goal.getByRole("button", { name: "+ Подцель" }).click();
  dialog = page.getByRole("dialog", { name: "Новая подцель" });
  await dialog.getByLabel("Название").fill("Подготовить модуль");
  await dialog.getByRole("button", { name: "Добавить подцель" }).click();
  await expect(goal).toContainText("0 из 1 шагов выполнено");
  await goal.getByRole("button", { name: "Запланировать" }).click();
  dialog = page.getByRole("dialog", { name: "Новый пункт плана" });
  await dialog.getByLabel("Название").fill("Собрать задания модуля");
  await dialog.getByRole("button", { name: "Добавить" }).click();
  await expect(goal).toContainText("0 из 2 шагов выполнено");

  await page.getByRole("button", { name: "Неделя" }).click();
  await expect(page.getByTestId("planner-week")).toBeVisible();
  await page.getByRole("button", { name: "Месяц" }).click();
  await expect(page.getByTestId("planner-month")).toBeVisible();
});

for (const width of [360, 768, 1024, 1440]) {
  test(`planner has no horizontal page overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await loginTeacher(page);
    await page.goto("/#/teacher/planner");
    await expect(page.getByTestId("planner-day")).toBeVisible();
    await expect(page.getByText("Подготовить материалы к занятию")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.screenshot({ fullPage: true, path: `artifacts/phase10/planner-${width}.png` });
  });
}

test("student cannot discover the private planner route", async ({ page }) => {
  await page.goto("/#/login");
  await page.getByLabel("Логин").fill("test.student");
  await page.getByLabel("Пароль").fill("Student-test-2026!");
  await page.getByRole("button", { name: "Войти" }).click();
  await page.goto("/#/teacher/planner");
  await expect(page).toHaveURL(/#\/student/);
  await expect(page.getByText("Личное пространство преподавателя")).toHaveCount(0);
});
