import { expect, test, type Page } from "@playwright/test";

const widths = [360, 768, 1024, 1440] as const;

async function login(page: Page, username: string, password: string, shell: "teacher" | "student") {
  await page.goto("/#/login");
  await page.getByLabel("Логин").fill(username);
  await page.getByLabel("Пароль").fill(password);
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page.getByTestId(`${shell}-shell`)).toBeVisible();
}

async function setTheme(page: Page, theme: "light" | "dark") {
  const current = await page.locator("html").getAttribute("data-theme");
  if (current !== theme) {
    await page.getByRole("button", { name: theme === "dark" ? "Включить тёмную тему" : "Включить светлую тему" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
  }
}

async function capture(page: Page, audience: "teacher" | "student", theme: "light" | "dark") {
  await setTheme(page, theme);
  for (const width of widths) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const metrics = await page.evaluate(() => ({
      viewport: window.innerWidth,
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
    }));
    expect(metrics.document).toBeLessThanOrEqual(metrics.viewport);
    expect(metrics.body).toBeLessThanOrEqual(metrics.viewport);
    await page.screenshot({ path: `artifacts/phase9a/${audience}-${theme}-${width}.png`, fullPage: true });
  }
}

test("teacher dashboard is responsive in Light and Dark", async ({ page }) => {
  await login(page, "test.teacher", "Teacher-test-2026!", "teacher");
  await expect(page.getByText("Работ на проверку")).toBeVisible();
  await expect(page.getByText("Нужно сделать")).toBeVisible();
  await expect(page.locator(".teacher-stat-grid > a").filter({ hasText: "Уроков сегодня" }).getByText("1", { exact: true })).toBeVisible();
  await capture(page, "teacher", "light");
  await capture(page, "teacher", "dark");
});

test("student dashboard is responsive in Light and Dark", async ({ page }) => {
  await login(page, "test.student", "Student-test-2026!", "student");
  await expect(page.getByText(/До экзамена \d+ дней/).first()).toBeVisible();
  await expect(page.getByText("Последнее достижение")).toBeVisible();
  await capture(page, "student", "light");
  await capture(page, "student", "dark");
});
