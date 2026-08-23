import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, username: string, password: string, shell: "teacher" | "student") { await page.goto("/#/login"); await page.getByLabel("Логин").fill(username); await page.getByLabel("Пароль").fill(password); await page.getByRole("button", { name: "Войти" }).click(); await expect(page.getByTestId(`${shell}-shell`)).toBeVisible(); }
async function route(page: Page, path: string) { await page.evaluate((value) => { window.location.hash = value; }, path); await page.waitForTimeout(150); }

test("Phase 9B.2 teacher acceptance fixes remain functional", async ({ page }) => {
  test.setTimeout(90_000);
  await login(page, "test.teacher", "Teacher-test-2026!", "teacher");
  await page.getByRole("button", { name: "Свернуть меню" }).click();
  await expect(page.locator(".teacher-shell--collapsed .sidebar-label").first()).toBeHidden();
  await page.locator(".teacher-sidebar .sidebar-expand-zone").click();
  await expect(page.getByRole("button", { name: "Свернуть меню" })).toBeVisible();

  await route(page, "/teacher/calendar");
  await page.getByRole("button", { name: "+ Добавить оплату" }).click();
  await expect(page.getByRole("dialog", { name: "Добавить оплату" }).getByLabel("Ученик")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Закрыть" }).click();
  const planned = page.locator(".calendar-event--planned").first();
  await expect(planned).toBeVisible(); await planned.click();
  await page.getByRole("button", { name: "Завершить урок" }).click();
  const completion = page.getByRole("dialog", { name: "Завершить занятие" });
  const hash = await page.evaluate(() => location.hash);
  await completion.getByRole("button", { name: "Добавить подробности" }).click();
  await expect(completion.getByTestId("lesson-optional-details")).toBeVisible();
  expect(await page.evaluate(() => location.hash)).toBe(hash);
  await completion.getByLabel("Тема урока").fill("Phase 9B.2 · итог урока");
  await page.waitForTimeout(450);
  let rejectNextCommit = true;
  await page.route(/documents:commit/, async (request) => {
    if (rejectNextCommit) {
      rejectNextCommit = false;
      await request.fulfill({
        body: JSON.stringify({
          error: {
            code: 403,
            message: "Phase 9B.2 forced retry",
            status: "PERMISSION_DENIED",
          },
        }),
        contentType: "application/json",
        status: 403,
      });
      return;
    }
    await request.continue();
  });
  await completion.getByRole("button", { name: "Завершить урок" }).click();
  await expect(completion.getByText("Не удалось сохранить. Черновик остался на устройстве.")).toBeVisible();
  await expect(completion.getByRole("button", { name: "Попробовать снова" })).toBeVisible();
  expect(await page.evaluate(() => Object.keys(localStorage).some((key) => key.startsWith("lesson-summary-draft:")))).toBeTruthy();
  await page.unroute(/documents:commit/);
  await completion.getByRole("button", { name: "Попробовать снова" }).click();
  await expect(page.getByTestId("lesson-completion-success")).toContainText("Урок завершён · Итоги сохранены");
  await page.getByTestId("lesson-completion-success").getByRole("button", { name: "Позже" }).click();
  await expect(page.getByTestId("selected-lesson-payment")).toBeVisible();
  await page.getByRole("button", { name: "Отметить это занятие оплаченным" }).click();
  await expect(page.getByTestId("selected-lesson-payment")).toContainText("Занятие оплачено");
  await page.getByRole("link", { name: "Открыть в журнале" }).click();
  await expect(page.locator(".lesson-history-card--target")).toBeVisible();
  await expect(page).toHaveURL(/tab=lessons&lesson=/);

  await route(page, "/teacher/students"); await page.getByTestId("student-card").filter({ hasText: "Тестовая ученица" }).click();
  const studentTabs = page.getByRole("navigation", { name: "Разделы карточки ученика" });
  for (const name of ["Обзор", "Занятия", "Домашние задания", "Пробники", "Оплата"]) await expect(studentTabs.getByRole("link", { name, exact: true })).toBeVisible();
  const conferenceLinks = page.locator(".conference-links-card");
  await expect(conferenceLinks.getByRole("link", { name: "Открыть" })).toBeVisible();
  await expect(conferenceLinks.getByRole("button", { name: "Копировать" })).toBeVisible();
  await conferenceLinks.getByRole("button", { name: "Изменить" }).click();
  await expect(conferenceLinks.getByRole("button", { name: "Сделать основной" })).toBeVisible();
  await expect(conferenceLinks.getByRole("button", { name: "Удалить" })).toBeVisible();
  await conferenceLinks.getByLabel("Ссылка").fill("https://meet.example.test/phase9b2");
  await conferenceLinks.getByRole("button", { name: "Сохранить ссылки" }).click();
  await expect(page.getByRole("status")).toContainText("Ссылки на занятия сохранены.");
  await studentTabs.getByRole("link", { name: "Домашние задания", exact: true }).click(); await expect(page.getByTestId("homework-package-form")).toBeVisible();
  await page.getByRole("link", { name: "← К ученикам" }).click(); await expect(page.getByRole("heading", { name: "Ученики" })).toBeVisible();

  await route(page, "/teacher/homeworks?filter=pending");
  await page.getByTestId("teacher-homework-card").filter({ hasText: "Сочинение и изложение · отдельная проверка" }).click();
  await expect(page.getByTestId("multi-item-review")).toBeVisible();
  await expect(page.locator(".structured-item-review")).toHaveCount(2);
  await expect(page.getByRole("dialog")).toContainText("ГК4"); await expect(page.getByRole("dialog")).toContainText("ФК");
  await page.getByRole("dialog").getByRole("button", { name: "Закрыть" }).click();

  await route(page, "/teacher/materials"); await page.getByRole("button", { name: /Избранное/ }).click(); await page.getByRole("button", { name: /Все материалы/ }).click();
  await expect(page.getByText("Недавние", { exact: true })).toHaveCount(0);
  await route(page, "/teacher/analytics"); await page.locator(".analytics-filters select").selectOption({ label: "Тестовая ученица" });
  await expect(page.getByTestId("homework-analytics")).toBeVisible(); await expect(page.locator(".task-mastery--no-data, .task-mastery--failed, .task-mastery--learning, .task-mastery--strong")).toHaveCount(13);
});

test("Phase 9B.2 student cards and analytics deep links", async ({ page }) => {
  await login(page, "test.student", "Student-test-2026!", "student");
  await expect(page.getByRole("link", { name: "Подключиться" })).toHaveAttribute("href", "https://meet.example.test/phase9b2");
  await expect(page.locator("a.dashboard-card, a.readiness-card")).toHaveCount(3);
  await expect(page.getByTestId("student-homework-title")).not.toHaveText("Нет активного задания");
  const currentTitle = await page.getByTestId("student-homework-title").innerText();
  await page.getByTestId("student-homework-card").click();
  await expect(page).toHaveURL(/homework=.+/);
  await expect(page.getByTestId("homework-card").filter({ hasText: currentTitle })).toHaveClass(/student-homework-card--open/);
  await route(page, "/student/progress"); await expect(page.getByTestId("homework-analytics")).toBeVisible();
  await page.getByRole("button", { name: "Свернуть меню" }).click(); await expect(page.locator(".student-shell--collapsed .student-nav-label").first()).toBeHidden();
  await route(page, "/student/materials"); const badge = page.locator(".new-badge").first(); await expect(badge).toBeVisible(); const card = badge.locator("xpath=ancestor::article"); const [badgeBox, titleBox] = await Promise.all([badge.boundingBox(), card.locator("h2").boundingBox()]); expect(badgeBox && titleBox && badgeBox.y + badgeBox.height <= titleBox.y).toBeTruthy();
});
