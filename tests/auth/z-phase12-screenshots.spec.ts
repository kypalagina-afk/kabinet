import { mkdir } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

const output = "artifacts/phase12";
async function login(page: Page, username = "test.teacher", password = "Teacher-test-2026!", shell: "teacher" | "student" = "teacher") {
  await page.goto("/#/login");
  await page.getByLabel("Логин").fill(username);
  await page.getByLabel("Пароль").fill(password);
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page.getByTestId(`${shell}-shell`)).toBeVisible();
}

test("capture Phase 12 multi-program acceptance surfaces", async ({ browser }) => {
  test.setTimeout(120_000);
  await mkdir(output, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await login(page);
  await page.goto("/#/teacher/students");
  await page.screenshot({ fullPage: true, path: `${output}/teacher-students-oge-ege.png` });
  await page.goto("/#/teacher/mock-exams");
  await page.getByRole("button", { name: "+ Добавить пробник" }).click();
  await page.getByRole("dialog", { name: "Добавить пробник" }).getByLabel("Ученик").selectOption({ label: "Анна · ЕГЭ" });
  await expect(page.getByLabel("К10 балл")).toBeVisible();
  await page.screenshot({ fullPage: true, path: `${output}/ege-mock-create.png` });
  await page.getByRole("button", { name: "Закрыть" }).click();
  await page.goto("/#/teacher/homeworks?filter=review&homework=test-ege-essay-27-pending");
  await expect(page.getByLabel("К10 балл")).toBeVisible();
  await page.screenshot({ fullPage: true, path: `${output}/ege-essay-k1-k10-review.png` });
  await page.goto("/#/teacher/materials");
  await page.getByRole("button", { name: "+ Добавить материал" }).click();
  await page.getByRole("dialog", { name: "Добавить материал" }).getByLabel("Программа").selectOption({ label: "ЕГЭ · Русский язык" });
  await page.screenshot({ fullPage: true, path: `${output}/materials-ege-selector.png` });
  await page.close();

  const mobile = await browser.newPage({ viewport: { width: 360, height: 800 } });
  await login(mobile, "test.ege.student", "Ege-student-2027!", "student");
  await mobile.goto("/#/student/progress");
  await expect(mobile.getByRole("heading", { name: "38/50" })).toBeVisible();
  expect(await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  await mobile.screenshot({ fullPage: true, path: `${output}/mobile-ege-progress-360.png` });
  await mobile.close();
});
