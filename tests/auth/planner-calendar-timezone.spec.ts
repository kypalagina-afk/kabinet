import { expect, test, type Page } from "@playwright/test";

async function loginTeacher(page: Page) {
  await page.goto("/#/login");
  await page.getByLabel("Логин").fill("test.teacher");
  await page.getByLabel("Пароль").fill("Teacher-test-2026!");
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page.getByTestId("teacher-shell")).toBeVisible();
}

test("planner timeline, calendar date picker and student timezone editor are available", async ({ page }) => {
  await loginTeacher(page);

  await page.goto("/#/teacher/planner");
  await page.getByRole("button", { name: "Временная шкала" }).click();
  await expect(page.getByTestId("planner-timeline")).toBeVisible();
  await expect(page.getByLabel("Дата планера")).toHaveAttribute("type", "date");
  await expect(page.getByTestId("planner-day-category-board")).toHaveCount(0);

  await page.goto("/#/teacher/calendar");
  await expect(page.getByLabel("Выбрать дату календаря занятий")).toHaveAttribute("type", "date");

  await page.goto("/#/teacher/students");
  await page.getByTestId("student-card").filter({ hasText: "Тестовая ученица" }).click();
  await page.getByRole("button", { name: "Редактировать" }).click();
  await expect(page.getByLabel("Часовой пояс ученика")).toBeVisible();
});

