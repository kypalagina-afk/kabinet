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

test("teacher can set a student login and password manually", async ({ page }) => {
  await login(page);
  await page.goto("/#/teacher/students");
  await page.getByTestId("student-card").filter({ hasText: "Анна · ЕГЭ" }).click();

  await page.getByLabel("Логин").fill("anna.ege.updated");
  await page.getByLabel(/Новый пароль/).fill("Manual-Ege-2027!");
  await page.getByRole("button", { name: "Сохранить данные входа" }).click();
  await expect(page.getByText("Логин и новый пароль сохранены", { exact: false })).toBeVisible();

  await page.getByRole("button", { name: "Выйти" }).click();
  await login(page, "anna.ege.updated", "Manual-Ege-2027!", "student");
});

test("teacher can switch an existing student from OGE to EGE", async ({ page }) => {
  await login(page);
  await page.goto("/#/teacher/students");
  await page.getByTestId("student-card").filter({ hasText: "Тестовая ученица" }).click();
  await page.getByRole("button", { name: "Редактировать" }).click();

  await page.getByLabel("Программа подготовки").selectOption("test-ege-program");
  await page.getByLabel("Цель занятий по программе").fill("85+ баллов");
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();

  await expect(page.getByTestId("teacher-program-title")).toContainText("ЕГЭ");
  await expect(page.getByText("85+ баллов", { exact: true })).toBeVisible();
});

test("teacher can preview and import Russian100 attempts without an API", async ({ page }) => {
  await login(page);
  await page.goto("/#/teacher/students");
  await page.getByTestId("student-card").filter({ hasText: "Тестовая ученица" }).click();
  await page
    .getByRole("navigation", { name: "Разделы карточки ученика" })
    .getByRole("link", { name: "Практика" })
    .click();

  await page.getByLabel("Результаты").fill([
    "11; 07.06.2026 13:57; 3/5; завершено",
    "11; 08.06.2026 14:10; 5/5; завершено",
  ].join("\n"));
  await page.getByRole("button", { name: "Подготовить черновик" }).click();
  await expect(page.getByRole("heading", { name: "Проверьте перед импортом" })).toBeVisible();
  await page.getByRole("button", { name: "Импортировать выбранное · 2" }).click();

  await expect(page.getByText("Добавлено: 2. Уже было импортировано: 0.")).toBeVisible();
  await expect(page.getByLabel("Сводка Русский100").getByText("Попыток: 2", { exact: false })).toBeVisible();
  await expect(page.getByLabel("Сводка Русский100").getByText("Последняя: 5/5")).toBeVisible();
});
