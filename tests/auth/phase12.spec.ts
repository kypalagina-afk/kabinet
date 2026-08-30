import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, username = "test.teacher", password = "Teacher-test-2026!", shell: "teacher" | "student" = "teacher") {
  await page.goto("/#/login");
  await page.getByLabel("Логин").fill(username);
  await page.getByLabel("Пароль").fill(password);
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page.getByTestId(`${shell}-shell`)).toBeVisible();
}

test("teacher sees OGE and EGE in one cabinet and the mock form follows the blueprint", async ({ page }) => {
  await login(page);
  await page.goto("/#/teacher/students");
  await expect(page.getByRole("link", { name: /ОГЭ · Русский язык/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /ЕГЭ · Русский язык/ })).toBeVisible();

  await page.goto("/#/teacher/mock-exams");
  await page.getByRole("button", { name: "+ Добавить пробник" }).click();
  const dialog = page.getByRole("dialog", { name: "Добавить пробник" });
  await dialog.getByLabel("Ученик").selectOption({ label: "Анна · ЕГЭ" });
  await expect(dialog.getByRole("heading", { name: "Результаты ЕГЭ" })).toBeVisible();
  await expect(dialog.getByLabel("Задание №8")).toHaveAttribute("max", "2");
  await expect(dialog.getByLabel("Задание №22")).toHaveAttribute("max", "2");
  await expect(dialog.getByLabel("К10 балл")).toHaveAttribute("max", "3");
  await expect(dialog.getByText("/50", { exact: false })).toBeVisible();
  await dialog.locator("select").first().selectOption({ label: "Тестовая ученица" });
  await expect(dialog.getByLabel("СК2 балл")).toHaveAttribute("max", "4");
  await expect(dialog.getByText("/38", { exact: false })).toBeVisible();
  await dialog.getByRole("button", { name: "Закрыть" }).click();
  await expect(page.getByText("29/38", { exact: true })).toBeVisible();
  await expect(page.getByText("20/37", { exact: false })).toBeVisible();
});

test("EGE task 27 homework has a fast K1-K10 review and 150-word rule", async ({ page }) => {
  await login(page);
  await page.goto("/#/teacher/homeworks?filter=review&homework=test-ege-essay-27-pending");
  await expect(page.getByTestId("multi-item-review")).toBeVisible();
  await expect(page.getByLabel("К1 балл")).toBeVisible();
  await expect(page.getByLabel("К10 балл")).toBeVisible();
  await expect(page.getByLabel("К7 ошибок")).toBeVisible();
  await expect(page.getByText("Объём: 155 слов")).toBeVisible();
  await expect(page.getByText("0/22")).toBeVisible();
});

test("homework and material task selectors use the active EGE blueprint", async ({ page }) => {
  await login(page);
  await page.goto("/#/teacher/students");
  await page.getByRole("link", { name: /Анна · ЕГЭ/ }).click();
  await page
    .getByRole("navigation", { name: "Разделы карточки ученика" })
    .getByRole("link", { name: "Домашние задания" })
    .click();
  await expect(page.getByRole("heading", { name: "Новое домашнее задание" })).toBeVisible();
  await expect(page.getByRole("button", { name: "№27" })).toBeVisible();

  await page.goto("/#/teacher/materials");
  await page.getByRole("button", { name: "+ Добавить материал" }).click();
  const dialog = page.getByRole("dialog", { name: "Добавить материал" });
  await dialog.getByLabel("Программа").selectOption({ label: "ЕГЭ · Русский язык" });
  await expect(dialog.getByRole("button", { name: "№27" })).toBeVisible();
});

test("EGE student sees the preserved result", async ({ page }) => {
  await login(page, "test.ege.student", "Ege-student-2027!", "student");
  await page.goto("/#/student/progress");
  await expect(page.getByRole("heading", { name: "38/50" })).toBeVisible();
  await page.goto("/#/student/homework");
  await expect(page.getByText("Проверить сочинение №27")).toBeVisible();
});

test("teacher can schedule the EGE student", async ({ page }) => {
  await login(page);
  await page.goto("/#/teacher/calendar");
  const form = page.locator("form.recurring-series-form");
  await form.getByLabel("Ученик").selectOption({ label: "Анна · ЕГЭ" });
  await form.getByLabel("Начало серии").fill("2026-09-03");
  await form.getByRole("button", { name: "Создать серию" }).click();
  await expect(page.getByText("Серия сохранена и материализована на 12 недель.")).toBeVisible();
  await expect(page.getByText("Операция не выполнена", { exact: false })).toHaveCount(0);
  await expect(
    page.locator(".calendar-student-filter").filter({ hasText: "Ученик" }).locator("option:checked"),
  ).toHaveText("Анна · ЕГЭ");
});
