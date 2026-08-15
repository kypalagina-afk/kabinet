import { expect, test, type Page } from "@playwright/test";

const teacherCredentials = {
  username: "test.teacher",
  password: "Teacher-test-2026!",
};

const studentCredentials = {
  username: "test.student",
  password: "Student-test-2026!",
};

async function loginTeacher(page: Page) {
  await page.goto("/#/login");
  await page.getByLabel("Логин").fill(teacherCredentials.username);
  await page.getByLabel("Пароль").fill(teacherCredentials.password);
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page.getByTestId("teacher-shell")).toBeVisible();
}

async function loginStudent(page: Page) {
  await page.goto("/#/login");
  await page.getByLabel("Логин").fill(studentCredentials.username);
  await page.getByLabel("Пароль").fill(studentCredentials.password);
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page.getByTestId("student-shell")).toBeVisible();
}

test("teacher month calendar loads recurring lessons and switches display timezone", async ({
  page,
}) => {
  await loginTeacher(page);
  await page.getByRole("link", { name: "Расписание", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Календарь занятий" })).toBeVisible();
  await expect(page.getByTestId("teacher-month-calendar")).toBeVisible();
  await expect(page.getByTestId("calendar-event").first()).toBeVisible();
  await expect(page.getByText(/Все занятия хранятся относительно Москвы/)).toBeVisible();

  await page.locator(".calendar-toolbar .calendar-student-filter").first().getByRole("combobox").selectOption({ label: "Тестовая ученица" });
  await page.getByRole("button", { name: "Время ученика" }).click();
  await expect(page.getByRole("button", { name: "Время ученика" })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Москва" }).click();
  await expect(page.getByRole("button", { name: "Москва" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("calendar remains usable without horizontal scrolling at required widths", async ({ page }) => {
  await loginTeacher(page);
  await page.getByRole("link", { name: "Расписание", exact: true }).click();
  await expect(page.getByTestId("teacher-month-calendar")).toBeVisible();
  await expect(page.getByTestId("calendar-event").first()).toBeVisible();

  for (const width of [360, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(page.getByTestId("teacher-month-calendar")).toBeVisible();
    await expect(page.getByRole("button", { name: "Моё время" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Москва" })).toBeVisible();
    const metrics = await page.evaluate(() => ({
      viewport: window.innerWidth,
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
    }));
    expect(metrics.document).toBeLessThanOrEqual(metrics.viewport);
    expect(metrics.body).toBeLessThanOrEqual(metrics.viewport);
    await page.screenshot({
      path: `artifacts/phase4/teacher-calendar-${width}.png`,
      fullPage: true,
    });
  }
});

test("student sees the next lesson in realtime on a mobile layout", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await loginStudent(page);

  const nextLesson = page.getByTestId("student-lesson");
  await expect(nextLesson).toBeVisible();
  await expect(nextLesson.getByText("Ближайшее занятие", { exact: true })).toBeVisible();
  await expect(page.getByTestId("student-next-lesson-time")).toBeVisible();
  await expect(nextLesson.getByText("Тестовое занятие по пунктуации")).toBeVisible();
  await page.screenshot({
    path: "artifacts/phase4/student-next-lesson-360.png",
    fullPage: true,
  });
});
