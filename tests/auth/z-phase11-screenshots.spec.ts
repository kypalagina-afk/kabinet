import { mkdir } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

const output = "artifacts/phase11";
async function login(page: Page) {
  await page.goto("/#/login");
  await page.getByLabel("Логин").fill("test.teacher");
  await page.getByLabel("Пароль").fill("Teacher-test-2026!");
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page.getByTestId("teacher-shell")).toBeVisible();
}

test("capture Phase 11 planner and AI surfaces", async ({ browser }) => {
  test.setTimeout(120_000);
  await mkdir(output, { recursive: true });
  for (const width of [360, 768, 1024, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 950 } });
    await login(page);
    await page.goto("/#/teacher/planner");
    await expect(page.getByTestId("planner-day")).toBeVisible();
    await page.screenshot({ fullPage: true, path: `${output}/planner-day-${width}.png` });
    await page.getByRole("button", { name: "Неделя" }).click();
    await page.screenshot({ fullPage: true, path: `${output}/planner-week-${width}.png` });
    await page.getByRole("button", { name: "Месяц" }).click();
    await page.screenshot({ fullPage: true, path: `${output}/planner-month-${width}.png` });
    await page.getByRole("button", { name: "Временная шкала" }).click();
    await expect(page.getByTestId("planner-timeline")).toBeVisible();
    await page.screenshot({ fullPage: true, path: `${output}/planner-timeline-${width}.png` });
    await page.getByRole("button", { name: "Открыть AI-помощника" }).click();
    await page.getByLabel("Что подготовить?").fill("Запланируй на завтра: проверить сочинения; в 15:00 ногти");
    await page.getByRole("button", { name: "Подготовить черновик" }).click();
    await expect(page.getByText("Подготовлено задач: 2")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ fullPage: true, path: `${output}/ai-preview-${width}.png` });
    await page.close();
  }
});
