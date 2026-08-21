import { mkdir } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

const output = "artifacts/phase10";

async function login(page: Page, username: string, password: string, shell: "teacher" | "student") {
  await page.goto("/#/login");
  await page.getByLabel("Логин").fill(username);
  await page.getByLabel("Пароль").fill(password);
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page.getByTestId(`${shell}-shell`)).toBeVisible();
}

async function shot(page: Page, name: string) {
  await page.screenshot({ fullPage: true, path: `${output}/${name}.png` });
}

test("capture Phase 10 acceptance surfaces", async ({ page }) => {
  test.setTimeout(120_000);
  await mkdir(output, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page, "test.teacher", "Teacher-test-2026!", "teacher");

  await expect(page.getByTestId("planner-home-widget")).toBeVisible();
  await shot(page, "teacher-home-planner-widget");

  await page.goto("/#/teacher/planner");
  await expect(page.locator(".planner-entry--lesson").first()).toBeVisible();
  await shot(page, "planner-day-light");
  await page.getByTestId("planner-goals").screenshot({ path: `${output}/planner-goals.png` });
  await page.getByTestId("planner-someday").screenshot({ path: `${output}/planner-someday.png` });
  await page.getByRole("button", { name: "Неделя" }).click();
  await shot(page, "planner-week");
  await page.getByRole("button", { name: "Месяц" }).click();
  await shot(page, "planner-month");
  await page.getByRole("button", { name: /Включить (светлую|тёмную) тему/ }).click();
  await shot(page, "planner-month-alternate-theme");

  await page.goto("/#/teacher/students");
  await page.getByRole("button", { name: "+ Добавить ученика" }).click();
  await page.getByRole("dialog", { name: "Добавить ученика" }).screenshot({ path: `${output}/create-student.png` });
  await page.getByRole("button", { name: "Закрыть" }).click();

  await page.goto("/#/teacher/materials");
  await page.getByRole("button", { name: "+ Добавить материал" }).click();
  const materialDialog = page.getByRole("dialog", { name: "Добавить материал" });
  await expect(materialDialog.getByText("Или загрузите файл до 15 МБ")).toBeVisible();
  await materialDialog.screenshot({ path: `${output}/file-upload-teacher.png` });
  await materialDialog.getByRole("button", { name: "Закрыть" }).click();

  await page.getByRole("button", { name: "Выйти" }).click();
  await login(page, "test.student", "Student-test-2026!", "student");
  await page.goto("/#/student/homework");
  await page.getByTestId("homework-card").filter({ hasText: "Тестовое исходное ДЗ" }).getByRole("button").click();
  await expect(page.getByText("Прикрепить фото, PDF или документ")).toBeVisible();
  await shot(page, "file-upload-student-dark");
});
