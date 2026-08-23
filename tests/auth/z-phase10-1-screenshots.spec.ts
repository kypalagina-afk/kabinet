import { mkdir } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const output = "artifacts/phase10-1";

async function resetScreenshotBacklogFixture() {
  const app = getApps().find(({ name }) => name === "phase10-1-screenshots")
    ?? initializeApp({ projectId: "demo-kabinet-25" }, "phase10-1-screenshots");
  const db = getFirestore(app);
  const teacher = await db.collection("users").where("role", "==", "teacher").limit(1).get();
  const teacherId = teacher.docs[0]?.id;
  if (!teacherId) throw new Error("Teacher fixture is missing");
  const now = Timestamp.now();
  await db.doc("plannerItems/test-planner-someday").set({
    teacherId,
    itemType: "task",
    title: "Обновить подборку диктантов",
    category: "someday",
    status: "backlog",
    date: null,
    startTime: null,
    endTime: null,
    durationMinutes: null,
    deadline: null,
    notes: null,
    priority: "calm",
    goalId: null,
    subgoalId: null,
    sortOrder: 2,
    completedAt: null,
    active: true,
    createdAt: now,
    updatedAt: now,
    schemaVersion: 1,
  });
}

async function loginTeacher(page: Page) {
  await page.goto("/#/login");
  await page.getByLabel("Логин").fill("test.teacher");
  await page.getByLabel("Пароль").fill("Teacher-test-2026!");
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page.getByTestId("teacher-shell")).toBeVisible();
}

test("capture Phase 10.1 manual acceptance set", async ({ page }) => {
  test.setTimeout(120_000);
  await mkdir(output, { recursive: true });
  await resetScreenshotBacklogFixture();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginTeacher(page);

  await page.goto("/#/teacher/planner");
  await expect(page.getByTestId("planner-day-category-board")).toBeVisible();
  await expect(page.getByText("Подготовить материалы к занятию")).toBeVisible();
  await expect(page.getByText("Обновить подборку диктантов")).toBeVisible();
  await page.screenshot({ fullPage: true, path: `${output}/planner-day.png` });
  await page.locator('.planner-category-column[data-category="Когда-нибудь"]').screenshot({ path: `${output}/planner-backlog.png` });
  await page.locator(".planner-goals-open").click();
  await expect(page.getByTestId("planner-goals-workspace")).toBeVisible();
  await page.getByRole("dialog", { name: "Большие цели" }).screenshot({ path: `${output}/goal-workspace.png` });
  await page.getByRole("dialog", { name: "Большие цели" }).getByRole("button", { name: "Закрыть" }).click();
  await page.getByRole("button", { name: "Неделя" }).click();
  await page.screenshot({ fullPage: true, path: `${output}/planner-week.png` });
  await page.getByRole("button", { name: "Месяц" }).click();
  await page.screenshot({ fullPage: true, path: `${output}/planner-month.png` });

  await page.getByRole("button", { name: "Открыть профиль преподавателя" }).click();
  await page.locator(".avatar-popover").screenshot({ path: `${output}/avatar-picker.png` });

  await page.goto("/#/teacher/calendar");
  await page.locator(".calendar-event--planned").first().click();
  await expect(page.getByTestId("hard-delete-lesson")).toBeVisible();
  await page.locator(".calendar-inspector").screenshot({ path: `${output}/calendar-hard-delete.png` });

  await page.goto("/#/teacher/analytics");
  await page.locator(".analytics-filters").screenshot({ path: `${output}/analytics-selectors.png` });

  await page.goto("/#/teacher/homeworks");
  await page.getByRole("button", { name: "+ Создать ДЗ" }).click();
  await page.getByRole("dialog").screenshot({ path: `${output}/homework-create.png` });
});
