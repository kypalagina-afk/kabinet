import { expect, test, type Page } from "@playwright/test";

const teacherCredentials = {
  username: "test.teacher",
  password: "Teacher-test-2026!",
};
const studentCredentials = {
  username: "test.student",
  password: "Student-test-2026!",
};

async function login(
  page: Page,
  credentials: { username: string; password: string },
) {
  await page.goto("/#/login");
  await page.getByLabel("Логин").fill(credentials.username);
  await page.getByLabel("Пароль").fill(credentials.password);
  await page.getByRole("button", { name: "Войти" }).click();
}

async function expectNoHorizontalOverflow(page: Page) {
  const metrics = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(metrics.document).toBeLessThanOrEqual(metrics.viewport);
  expect(metrics.body).toBeLessThanOrEqual(metrics.viewport);
}

test("teacher login persists, saves theme and logs out", async ({ page }) => {
  await login(page, teacherCredentials);

  await expect(page.getByTestId("teacher-shell")).toBeVisible();
  await expect(page).toHaveURL(/#\/teacher$/);
  await expect(page.locator("body")).not.toContainText("@kabinet25.example.com");

  await page.reload();
  await expect(page.getByTestId("teacher-shell")).toBeVisible();

  await page.goto("/#/student");
  await expect(page.getByTestId("teacher-shell")).toBeVisible();
  await expect(page).toHaveURL(/#\/teacher$/);

  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Включить тёмную тему" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.getByRole("button", { name: "Выйти" }).click();
  await expect(page.getByRole("heading", { name: "Войти" })).toBeVisible();
  await expect(page).toHaveURL(/#\/login$/);
});

test("student receives the student shell and cannot open teacher route", async ({ page }) => {
  await login(page, studentCredentials);

  await expect(page.getByTestId("student-shell")).toBeVisible();
  await expect(page).toHaveURL(/#\/student$/);
  await page.goto("/#/teacher");
  await expect(page.getByTestId("student-shell")).toBeVisible();
  await expect(page).toHaveURL(/#\/student$/);
});

test("anonymous teacher route is guarded and registration is unavailable", async ({ page }) => {
  await page.goto("/#/teacher");

  await expect(page.getByRole("heading", { name: "Войти" })).toBeVisible();
  await expect(page.getByText("Самостоятельная регистрация отключена.")).toBeVisible();
  await expect(page.getByRole("link", { name: /регистра/i })).toHaveCount(0);
});

test("invalid credentials show a safe error", async ({ page }) => {
  await login(page, { username: "unknown.user", password: "Wrong-password-2026!" });

  await expect(page.getByRole("alert")).toHaveText("Неверный логин или пароль.");
  await expect(page.locator("body")).not.toContainText("unknown.user@kabinet25.example.com");
});

test("password visibility is explicit and resets after reload", async ({ page }) => {
  await page.goto("/#/login");
  const password = page.getByLabel("Пароль");
  await password.fill("Secret-2026!");
  await expect(password).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Показать введённые символы" }).click();
  await expect(password).toHaveAttribute("type", "text");
  await page.reload();
  await expect(page.getByLabel("Пароль")).toHaveAttribute("type", "password");
});

for (const width of [360, 768, 1024, 1440] as const) {
  test(`teacher and student shells fit ${width}px`, async ({ browser }) => {
    const teacherContext = await browser.newContext({ viewport: { width, height: 900 } });
    const teacherPage = await teacherContext.newPage();
    await login(teacherPage, teacherCredentials);
    await expect(teacherPage.getByTestId("teacher-shell")).toBeVisible();
    await expectNoHorizontalOverflow(teacherPage);
    await teacherPage.getByTestId("student-card").click();
    await expect(
      teacherPage.getByRole("heading", { name: "Тестовая ученица" }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(teacherPage);
    await teacherContext.close();

    const studentContext = await browser.newContext({ viewport: { width, height: 900 } });
    const studentPage = await studentContext.newPage();
    await login(studentPage, studentCredentials);
    await expect(studentPage.getByTestId("student-shell")).toBeVisible();
    await expectNoHorizontalOverflow(studentPage);
    await studentContext.close();
  });
}
