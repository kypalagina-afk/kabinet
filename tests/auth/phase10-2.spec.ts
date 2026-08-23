import { expect, test, type Page } from "@playwright/test";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

async function loginTeacher(page: Page) {
  await page.goto("/#/login");
  await page.getByLabel("Логин").fill("test.teacher");
  await page.getByLabel("Пароль").fill("Teacher-test-2026!");
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page.getByTestId("teacher-shell")).toBeVisible();
}

function emulatorDb() {
  const app = getApps().find(({ name }) => name === "phase10-2-regression")
    ?? initializeApp({ projectId: "demo-kabinet-25" }, "phase10-2-regression");
  return getFirestore(app);
}

test("dashboard lesson opens the same lesson in Calendar", async ({ page }) => {
  await loginTeacher(page);
  const row = page.getByTestId("teacher-home-lesson").first();
  await expect(row).toBeVisible();
  await row.click();
  await expect(page).toHaveURL(/#\/teacher\/calendar\?lesson=/);
  await expect(page.locator(".calendar-inspector")).toBeVisible();
});

test("Calendar uses one focus date for exact day, week and 42-day month views", async ({ page }) => {
  await loginTeacher(page);
  await page.goto("/#/teacher/calendar");

  await page.getByRole("button", { name: "День", exact: true }).click();
  await expect(page.getByTestId("teacher-day-calendar").locator(".agenda-day")).toHaveCount(1);

  await page.getByRole("button", { name: "Неделя", exact: true }).click();
  await expect(page.getByTestId("teacher-week-calendar").locator(".agenda-day")).toHaveCount(7);

  await page.getByRole("button", { name: "Месяц", exact: true }).click();
  await expect(page.getByTestId("teacher-month-calendar").locator(".calendar-day")).toHaveCount(42);
});

test("linked homework is atomic, idempotent and clears the dashboard action", async ({ page }) => {
  const db = emulatorDb();
  const teacher = await db.collection("users").where("role", "==", "teacher").limit(1).get();
  const student = await db.collection("users").where("role", "==", "student").limit(1).get();
  const teacherId = teacher.docs[0]?.id;
  const studentId = student.docs[0]?.id;
  if (!teacherId || !studentId) throw new Error("Phase 10.2 auth fixture is missing");

  const lessonId = "phase10-2-completed-pending";
  const homeworkId = `lesson-homework__${lessonId}`;
  const start = new Date();
  start.setHours(8, 0, 0, 0);
  const now = Timestamp.now();
  await db.doc(`lessons/${lessonId}`).set({
    teacherId,
    studentId,
    studentProgramId: "test-student-program-1",
    lessonSeriesId: null,
    startAt: Timestamp.fromDate(start),
    endAt: Timestamp.fromMillis(start.getTime() + 3_600_000),
    originalStartAt: null,
    rescheduledFromLessonId: null,
    rescheduledToLessonId: null,
    status: "completed",
    topic: "Финальная пунктуация",
    lessonSummary: {
      homeworkResultText: null,
      teacherComment: null,
      focusNotes: ["Сложное предложение"],
      errors: ["Граница частей сложного предложения"],
    },
    examTaskNumbers: [3],
    homeworkResolution: "pending",
    conferenceUrl: null,
    billingType: "regular",
    billingIdentityId: lessonId,
    paymentStatus: "paid",
    createdAt: now,
    updatedAt: now,
    schemaVersion: 1,
  });

  try {
    await loginTeacher(page);
    const action = page.getByText("Тестовая ученица · Не выдано ДЗ", { exact: true });
    await expect(action).toBeVisible();
    await action.click();
    await expect(page.getByTestId("homework-source-lesson")).toContainText("Финальная пунктуация");

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dueDate = [
      tomorrow.getFullYear(),
      String(tomorrow.getMonth() + 1).padStart(2, "0"),
      String(tomorrow.getDate()).padStart(2, "0"),
    ].join("-");
    await page.locator('input[name="homeworkDueDate"]').fill(dueDate);
    await page.getByRole("button", { name: "Назначить ДЗ" }).click();
    await expect(page.getByRole("status")).toContainText("Домашнее задание назначено");

    expect((await db.doc(`homeworks/${homeworkId}`).get()).data()?.sourceLessonId).toBe(lessonId);
    expect((await db.doc(`lessons/${lessonId}`).get()).data()?.homeworkResolution).toBe("assigned");
    const linked = await db.collection("homeworks").where("sourceLessonId", "==", lessonId).get();
    expect(linked.size).toBe(1);

    await page.goto("/#/teacher");
    await expect(page.getByText("Тестовая ученица · Не выдано ДЗ", { exact: true })).toHaveCount(0);
  } finally {
    await Promise.all([
      db.doc(`homeworks/${homeworkId}`).delete(),
      db.doc(`lessons/${lessonId}`).delete(),
    ]);
  }
});

test("teacher mobile navigation keeps primary actions and reveals secondary routes", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await loginTeacher(page);
  const nav = page.getByRole("navigation", { name: "Навигация преподавателя" });
  await expect(nav.locator(".navigation-item--primary-mobile")).toHaveCount(4);
  await expect(nav.getByRole("link", { name: "Материалы", exact: true })).toBeHidden();
  await nav.getByRole("button", { name: "Ещё" }).click();
  await expect(nav.getByRole("link", { name: "Материалы", exact: true })).toBeVisible();
});

test("analytics exposes the real student selector without a fake program selector", async ({ page }) => {
  await loginTeacher(page);
  await page.goto("/#/teacher/analytics");
  await expect(page.locator(".analytics-filters select")).toHaveCount(1);
  await expect(page.locator(".analytics-filters")).toContainText("Ученик");
  await expect(page.locator(".analytics-filters")).not.toContainText("Программа");
});
