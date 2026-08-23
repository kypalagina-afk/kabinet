import { expect, test, type Page } from "@playwright/test";

async function loginTeacher(page: Page) {
  await page.goto("/#/login");
  await page.getByLabel("Логин").fill("test.teacher");
  await page.getByLabel("Пароль").fill("Teacher-test-2026!");
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page.getByTestId("teacher-shell")).toBeVisible();
}

test("all 24 avatar assets load at the enlarged picker size", async ({ page }) => {
  await loginTeacher(page);
  await page.getByRole("button", { name: "Открыть профиль преподавателя" }).click();
  const popover = page.locator(".avatar-popover");
  await popover.getByRole("button", { name: "Животные" }).click();
  let images = popover.locator(".avatar-picker img");
  await expect(images).toHaveCount(12);
  await expect.poll(() => images.evaluateAll((nodes) => nodes.every((node) => (node as HTMLImageElement).complete && (node as HTMLImageElement).naturalWidth > 0))).toBe(true);
  await popover.getByRole("button", { name: "Ребята" }).click();
  images = popover.locator(".avatar-picker img");
  await expect(images).toHaveCount(12);
  await expect.poll(() => images.evaluateAll((nodes) => nodes.every((node) => (node as HTMLImageElement).complete && (node as HTMLImageElement).naturalWidth > 0))).toBe(true);
  const size = await popover.locator(".avatar--custom").first().boundingBox();
  expect(size?.width).toBeGreaterThanOrEqual(76);
  expect(size?.width).toBeLessThanOrEqual(84);
});

test("planner day is a category board and goals open a dedicated workspace", async ({ page }) => {
  await loginTeacher(page);
  await page.goto("/#/teacher/planner");
  const board = page.getByTestId("planner-day-category-board");
  await expect(board).toBeVisible();
  await expect(board.locator(".planner-category-column")).toHaveCount(3);
  await expect(board.locator('[data-category="Работа"] .planner-entry--lesson').first()).toBeVisible();
  await expect(board.locator('[data-category="Когда-нибудь"]')).toContainText("Обновить подборку диктантов");
  await page.locator(".planner-goals-open").click();
  await expect(page.getByTestId("planner-goals-workspace")).toBeVisible();
  await expect(page.getByTestId("planner-goals-workspace")).toContainText("Цель → подцели → задачи → планер");
});

test("teacher IANA timezone drives the dynamic Moscow label", async ({ page }) => {
  await loginTeacher(page);
  await page.goto("/#/teacher/calendar");
  await expect(page.getByText("МСК+4", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Открыть профиль преподавателя" }).click();
  await expect(page.getByLabel("Часовой пояс преподавателя")).toHaveValue("Asia/Novosibirsk");
});

test("teacher can hard-delete an accidental one-off lesson after confirmation", async ({ page }) => {
  await loginTeacher(page);
  await page.goto("/#/teacher/calendar");
  await page.getByRole("button", { name: "+ Занятие" }).click();
  const dialog = page.getByRole("dialog", { name: "Добавить занятие" });
  await dialog.getByLabel("Ученик").selectOption({ label: "Тестовая ученица" });
  await dialog.getByLabel("Время, МСК").fill("06:17");
  await dialog.getByRole("button", { name: "Добавить занятие" }).click();
  await expect(page.getByText("Занятие создано.")).toBeVisible();
  const accidental = page.locator(".calendar-event--planned").filter({ hasText: "10:17" }).first();
  await expect(accidental).toBeVisible();
  await accidental.click();
  await expect(page.getByTestId("hard-delete-lesson")).toBeVisible();
  page.once("dialog", (confirmation) => confirmation.accept());
  await page.getByTestId("hard-delete-lesson").click();
  await expect(page.getByText("Ошибочное занятие удалено без возможности восстановления.")).toBeVisible();
  await expect(accidental).toHaveCount(0);
});

test("sidebar has no global create duplicate and keeps context actions", async ({ page }) => {
  await loginTeacher(page);
  await expect(page.getByRole("button", { name: "+ Создать", exact: true })).toHaveCount(0);
  await page.goto("/#/teacher/homeworks");
  await expect(page.getByRole("button", { name: "+ Создать ДЗ" })).toBeVisible();
  await page.goto("/#/teacher/students");
  await expect(page.getByRole("button", { name: "+ Добавить ученика" })).toBeVisible();
});
