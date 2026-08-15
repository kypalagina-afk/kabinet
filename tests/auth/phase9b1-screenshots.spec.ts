import { mkdir } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

const root = "artifacts/phase9b1";

async function login(page: Page, username: string, password: string, shell: "teacher" | "student") {
  await page.goto("/#/login");
  await page.getByLabel("Логин").fill(username);
  await page.getByLabel("Пароль").fill(password);
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page.getByTestId(`${shell}-shell`)).toBeVisible();
}

async function route(page: Page, path: string) {
  await page.evaluate((value) => { window.location.hash = value; }, path);
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
}

async function setTheme(page: Page, theme: "light" | "dark") {
  if (await page.locator("html").getAttribute("data-theme") !== theme) {
    await page.getByRole("button", { name: theme === "dark" ? "Включить тёмную тему" : "Включить светлую тему" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
  }
}

async function shot(page: Page, theme: "light" | "dark", name: string) {
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${root}/${theme}/${name}.png`, fullPage: true });
}

async function closeDialog(page: Page) {
  const dialog = page.getByRole("dialog");
  if (await dialog.count()) await dialog.getByRole("button", { name: "Закрыть" }).click();
}

async function teacherScreens(page: Page, theme: "light" | "dark") {
  await setTheme(page, theme);
  if (await page.locator(".avatar-popover").isVisible()) await page.getByRole("button", { name: "Выбрать аватар преподавателя" }).click();
  await route(page, "/teacher");
  await shot(page, theme, "teacher-home-need-to-do");

  await route(page, "/teacher/calendar");
  await expect(page.getByTestId("calendar-event").first()).toBeVisible();
  await shot(page, theme, "teacher-calendar-month");
  await page.locator(".calendar-event--completed").first().click();
  await shot(page, theme, "teacher-selected-completed-lesson");
  await page.getByRole("button", { name: "Редактировать итоги" }).click();
  await expect(page.getByRole("dialog", { name: "Редактировать итоги занятия" })).toBeVisible();
  await shot(page, theme, "teacher-complete-lesson-modal");
  await closeDialog(page);
  await page.getByRole("button", { name: "Неделя" }).click();
  await shot(page, theme, "teacher-calendar-week");

  await route(page, "/teacher/students");
  await page.getByTestId("student-card").first().click();
  await expect(page.locator(".lesson-journal")).toBeVisible();
  await shot(page, theme, "teacher-student-lesson-journal");

  await route(page, "/teacher/homeworks");
  await shot(page, theme, "teacher-homework-list");
  await page.getByRole("button", { name: "Завершённые" }).click();
  await page.getByTestId("teacher-homework-card").filter({ hasText: "Сочинение по прочитанному тексту" }).click();
  await expect(page.getByRole("dialog")).toContainText("Сочинение ученицы.jpg");
  await shot(page, theme, "teacher-homework-exact-detail-attachment");
  await closeDialog(page);
  await page.getByRole("button", { name: "На проверке" }).click();
  await page.getByTestId("teacher-homework-card").filter({ hasText: "Сочинение · проверка по критериям" }).click();
  await shot(page, theme, "teacher-essay-review");
  await closeDialog(page);
  await page.getByTestId("teacher-homework-card").filter({ hasText: "Изложение · проверка по критериям" }).click();
  await shot(page, theme, "teacher-exposition-review");
  await closeDialog(page);

  await route(page, "/teacher/materials");
  await shot(page, theme, "teacher-materials-library");
  await page.getByRole("button", { name: /Избранное/ }).click();
  await shot(page, theme, "teacher-materials-favorites");
  await route(page, "/teacher");
  await route(page, "/teacher/materials");
  await page.locator(".folder-card > button").first().click();
  await shot(page, theme, "teacher-materials-folder");

  await route(page, "/teacher/analytics");
  await shot(page, theme, "teacher-analytics-all");
  await page.locator(".page-heading select").nth(1).selectOption({ label: "Тестовая ученица" });
  await expect(page.locator(".task-mastery-grid")).toBeVisible();
  await shot(page, theme, "teacher-analytics-student");

  await route(page, "/teacher/mock-exams");
  await shot(page, theme, "teacher-global-mocks");
  await page.getByRole("button", { name: "Подробнее" }).first().click();
  await shot(page, theme, "teacher-mock-detail");
  await closeDialog(page);
  await page.getByRole("button", { name: "Сравнить пробники" }).click();
  const checks = page.locator(".compare-check input");
  await checks.nth(0).check();
  await checks.nth(1).check();
  await expect(page.locator(".compare-card")).toBeVisible();
  await shot(page, theme, "teacher-mock-compare");

  if (!await page.locator(".avatar-popover").isVisible()) await page.getByRole("button", { name: "Выбрать аватар преподавателя" }).click();
  await expect(page.locator(".avatar-popover")).toBeVisible();
  await shot(page, theme, "teacher-avatar-picker");
}

async function studentScreens(page: Page, theme: "light" | "dark") {
  await setTheme(page, theme);
  await route(page, "/student");
  await shot(page, theme, "student-home");
  await shot(page, theme, "student-reviewed-homework-notification");

  await route(page, "/student/homework");
  await page.getByTestId("homework-card").filter({ hasText: "Практика: задания №2–5" }).getByRole("button").first().click();
  await shot(page, theme, "student-homework-active");
  await page.getByRole("button", { name: "Завершённые" }).click();
  await page.getByTestId("homework-card").filter({ hasText: "Сочинение по прочитанному тексту" }).getByRole("button").first().click();
  await shot(page, theme, "student-homework-checked-criteria");

  await route(page, "/student/lessons");
  await page.getByRole("button", { name: "Развернуть все" }).click();
  await shot(page, theme, "student-lessons");

  await route(page, "/student/progress");
  await shot(page, theme, "student-progress");
  await page.locator(".student-mock-history .mock-history-card").first().getByRole("button", { name: "Подробнее" }).click();
  await shot(page, theme, "student-mock-detail");
  await page.getByRole("button", { name: "Сравнить пробники" }).click();
  const checks = page.locator(".student-mock-history .compare-check input");
  await checks.nth(0).check();
  await checks.nth(1).check();
  await shot(page, theme, "student-mock-compare");

  await route(page, "/student/materials");
  await page.locator(".student-folder-grid button").first().click();
  await shot(page, theme, "student-materials-folder");
  await route(page, "/student/profile");
  await shot(page, theme, "student-avatar-picker");
}

test("capture complete Phase 9B.1 manual acceptance pack", async ({ page }) => {
  test.setTimeout(180_000);
  await mkdir(`${root}/light`, { recursive: true });
  await mkdir(`${root}/dark`, { recursive: true });
  await mkdir(`${root}/responsive`, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/#/login");
  await page.locator("html").evaluate((element) => element.setAttribute("data-theme", "light"));
  await shot(page, "light", "login");
  await login(page, "test.teacher", "Teacher-test-2026!", "teacher");
  await teacherScreens(page, "light");
  await teacherScreens(page, "dark");
  await page.getByRole("button", { name: "Выйти" }).click();
  await page.locator("html").evaluate((element) => element.setAttribute("data-theme", "dark"));
  await shot(page, "dark", "login");
  await login(page, "test.student", "Student-test-2026!", "student");
  await studentScreens(page, "dark");
  await studentScreens(page, "light");

  for (const theme of ["light", "dark"] as const) {
    await setTheme(page, theme);
    for (const width of [360, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await route(page, "/student");
      const metrics = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
      expect(metrics.document).toBeLessThanOrEqual(metrics.viewport);
      expect(metrics.body).toBeLessThanOrEqual(metrics.viewport);
      await page.screenshot({ path: `${root}/responsive/student-home-${theme}-${width}.png`, fullPage: true });
    }
  }

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Выйти" }).click();
  await login(page, "test.teacher", "Teacher-test-2026!", "teacher");
  for (const theme of ["light", "dark"] as const) {
    await setTheme(page, theme);
    for (const width of [360, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const [name, path] of [["teacher-home", "/teacher"], ["teacher-calendar-month", "/teacher/calendar"]] as const) {
        await route(page, path);
        const metrics = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
        expect(metrics.document).toBeLessThanOrEqual(metrics.viewport);
        expect(metrics.body).toBeLessThanOrEqual(metrics.viewport);
        await page.screenshot({ path: `${root}/responsive/${name}-${theme}-${width}.png`, fullPage: true });
      }
    }
  }
});
