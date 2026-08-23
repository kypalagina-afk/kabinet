import { mkdir } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

const root = "artifacts/phase9b2";

async function login(
  page: Page,
  username: string,
  password: string,
  shell: "teacher" | "student",
) {
  await page.goto("/#/login");
  await page.getByLabel("Логин").fill(username);
  await page.getByLabel("Пароль").fill(password);
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page.getByTestId(`${shell}-shell`)).toBeVisible();
}

async function route(page: Page, path: string) {
  await page.evaluate((value) => {
    window.location.hash = value;
  }, path);
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
}

async function shot(page: Page, name: string) {
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${root}/${name}.png`, fullPage: true });
}

test("capture Phase 9B.2 critical acceptance screens", async ({ page }) => {
  test.setTimeout(150_000);
  await mkdir(root, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1000 });

  await login(page, "test.teacher", "Teacher-test-2026!", "teacher");
  await expect(page.getByTestId("today-active-lesson-count")).toHaveText("1");
  await expect(page.getByText(/перенесено с/).first()).toBeVisible();
  await shot(page, "01-teacher-home-after-reschedule");

  await page.getByRole("button", { name: "Свернуть меню" }).click();
  await expect(page.locator(".teacher-shell--collapsed .sidebar-label").first()).toBeHidden();
  expect(
    await page
      .locator(".teacher-shell--collapsed .sidebar-label")
      .evaluateAll((labels) =>
        labels.every((label) => getComputedStyle(label).display === "none"),
      ),
  ).toBeTruthy();
  await shot(page, "02-teacher-collapsed-sidebar");
  await page.locator(".teacher-sidebar .sidebar-expand-zone").click();

  await route(page, "/teacher/calendar");
  await page.locator(".calendar-event--completed").first().click();
  await expect(page.getByTestId("selected-lesson-payment")).toBeVisible();
  await shot(page, "03-calendar-selected-lesson-payment");
  await page.getByRole("button", { name: "Редактировать итоги" }).click();
  const editDialog = page.getByRole("dialog", {
    name: "Редактировать итоги занятия",
  });
  await editDialog.getByRole("button", { name: "Сохранить изменения" }).click();
  await expect(page.getByTestId("lesson-completion-success")).toBeVisible();
  await shot(page, "04-complete-lesson-success");
  await page
    .getByTestId("lesson-completion-success")
    .getByRole("button", { name: "Позже" })
    .click();

  await route(page, "/teacher/students");
  await page
    .getByTestId("student-card")
    .filter({ hasText: "Тестовая ученица" })
    .click();
  await expect(
    page.getByRole("navigation", { name: "Разделы карточки ученика" }),
  ).toBeVisible();
  await shot(page, "05-teacher-student-card");

  await route(page, "/teacher/homeworks?filter=pending");
  await page
    .getByTestId("teacher-homework-card")
    .filter({ hasText: "Сочинение и изложение · отдельная проверка" })
    .click();
  await expect(page.locator(".structured-item-review")).toHaveCount(2);
  await shot(page, "06-teacher-homework-multi-item-review");
  await page.locator(".structured-item-review > summary").first().click();
  await shot(page, "06b-teacher-homework-two-review-sections");
  await page.getByRole("dialog").getByRole("button", { name: "Закрыть" }).click();

  await route(page, "/teacher/analytics");
  await page.locator(".analytics-filters select").selectOption({ label: "Тестовая ученица" });
  await expect(page.getByTestId("homework-analytics")).toBeVisible();
  await shot(page, "07-teacher-analytics-task-grid-homework");

  await page.getByRole("button", { name: "Выйти" }).click();
  await login(page, "test.student", "Student-test-2026!", "student");
  await expect(page.getByTestId("student-homework-title")).not.toHaveText(
    "Нет активного задания",
  );
  await shot(page, "08-student-home");

  await route(page, "/student/homework?homework=reviewed-homework");
  await expect(page.locator(".student-homework-card--open")).toBeVisible();
  await shot(page, "09-student-reviewed-homework");

  await route(page, "/student/progress");
  await expect(page.getByTestId("homework-analytics")).toBeVisible();
  await shot(page, "10-student-progress");
  await page.getByRole("button", { name: "Свернуть меню" }).click();
  await expect(page.locator(".student-shell--collapsed .student-nav-label").first()).toBeHidden();
  await shot(page, "11-student-collapsed-sidebar");
  await page.locator(".student-sidebar .sidebar-expand-zone").click();

  await page.setViewportSize({ width: 360, height: 900 });
  await route(page, "/student/materials");
  await expect(page.locator(".new-badge").first()).toBeVisible();
  await shot(page, "12-student-materials-new-badge-mobile-360");
});
