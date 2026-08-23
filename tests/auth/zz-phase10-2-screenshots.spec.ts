import { mkdir } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const output = "artifacts/phase10-2";

async function login(page: Page, username: string, password: string) {
  await page.goto("/#/login");
  await page.getByLabel("Логин").fill(username);
  await page.getByLabel("Пароль").fill(password);
  await page.getByRole("button", { name: "Войти" }).click();
}

function dateKey(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

test("capture Phase 10.2 stability and trust acceptance set", async ({ browser }) => {
  test.setTimeout(180_000);
  await mkdir(output, { recursive: true });
  const app = getApps().find(({ name }) => name === "phase10-2-screenshots")
    ?? initializeApp({ projectId: "demo-kabinet-25" }, "phase10-2-screenshots");
  const db = getFirestore(app);
  const teacher = await db.collection("users").where("username", "==", "test.teacher").limit(1).get();
  const student = await db.collection("users").where("username", "==", "test.student").limit(1).get();
  const teacherId = teacher.docs[0]?.id;
  const studentId = student.docs[0]?.id;
  if (!teacherId || !studentId) throw new Error("Phase 10.2 screenshot fixture is missing");

  const now = Timestamp.now();
  const nextMonth = new Date();
  nextMonth.setDate(1);
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  nextMonth.setHours(10, 0, 0, 0);
  const outsideDate = dateKey(nextMonth);
  const outsideStart = new Date(`${outsideDate}T03:00:00.000Z`);
  const outsideLessonId = "phase10-2-outside-month";
  const revisionHomeworkId = "phase10-2-revision-homework";

  await Promise.all([
    db.doc(`lessons/${outsideLessonId}`).set({
      teacherId,
      studentId,
      studentProgramId: "test-student-program-1",
      lessonSeriesId: null,
      startAt: Timestamp.fromDate(outsideStart),
      endAt: Timestamp.fromMillis(outsideStart.getTime() + 3_600_000),
      originalStartAt: null,
      rescheduledFromLessonId: null,
      rescheduledToLessonId: null,
      status: "planned",
      topic: "Урок за границей месяца",
      lessonSummary: { homeworkResultText: null, teacherComment: null, focusNotes: [] },
      examTaskNumbers: [3],
      homeworkResolution: "pending",
      conferenceUrl: null,
      billingType: "regular",
      billingIdentityId: outsideLessonId,
      paymentStatus: "paid",
      createdAt: now,
      updatedAt: now,
      schemaVersion: 1,
    }),
    db.doc(`homeworks/${revisionHomeworkId}`).set({
      teacherId,
      studentId,
      studentProgramId: "test-student-program-1",
      sourceLessonId: null,
      type: "essay",
      title: "Доработать сочинение: аргументация",
      description: "Исправить второй пример и микровывод.",
      examTaskNumbers: [13],
      assignedAt: now,
      dueAt: null,
      dueDate: dateKey(new Date(Date.now() + 3 * 86_400_000)),
      dueTime: null,
      dueTimezone: "Europe/Moscow",
      status: "needs_revision",
      requiredAmount: null,
      items: [{
        itemId: "revision-essay",
        type: "essay",
        title: "Исправить сочинение",
        description: null,
        requiredAmount: null,
        examTaskNumbers: [13],
        attachments: [],
        materialIds: [],
        sortOrder: 0,
      }],
      attachments: [],
      reviewCriteria: null,
      createdAt: now,
      updatedAt: now,
      schemaVersion: 1,
    }),
  ]);

  const teacherContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const teacherPage = await teacherContext.newPage();
  await login(teacherPage, "test.teacher", "Teacher-test-2026!");
  await expect(teacherPage.getByTestId("teacher-shell")).toBeVisible();

  await expect(teacherPage.getByTestId("teacher-home-lesson").first()).toBeVisible();
  await teacherPage.screenshot({ fullPage: true, path: `${output}/teacher-home-clickable-lesson.png` });

  await teacherPage.goto("/#/teacher/calendar");
  await teacherPage.getByRole("button", { name: "День", exact: true }).click();
  await expect(teacherPage.getByTestId("teacher-day-calendar")).toBeVisible();
  await teacherPage.screenshot({ fullPage: true, path: `${output}/calendar-day.png` });
  await teacherPage.getByRole("button", { name: "Неделя", exact: true }).click();
  await expect(teacherPage.getByTestId("teacher-week-calendar")).toBeVisible();
  await teacherPage.screenshot({ fullPage: true, path: `${output}/calendar-week.png` });
  await teacherPage.getByRole("button", { name: "Месяц", exact: true }).click();
  const outsideEvent = teacherPage.locator(".calendar-day--outside").filter({ hasText: "Тестовая ученица" }).locator('[data-testid="calendar-event"]');
  await expect(outsideEvent).toBeVisible();
  await teacherPage.screenshot({ fullPage: true, path: `${output}/calendar-month-outside-lesson.png` });

  await teacherPage.goto(`/#/teacher/students/${studentId}`);
  await expect(teacherPage.getByRole("region", { name: "Быстрые действия" })).toBeVisible();
  await teacherPage.screenshot({ fullPage: true, path: `${output}/student-overview-simplified.png` });

  await teacherPage.goto(`/#/teacher/students/${studentId}?tab=homework&sourceLesson=test-completed-lesson`);
  await expect(teacherPage.getByTestId("homework-source-lesson")).toBeVisible();
  await teacherPage.screenshot({ fullPage: true, path: `${output}/homework-linked-to-lesson.png` });

  await teacherPage.goto("/#/teacher/materials");
  await expect(teacherPage.locator(".filter-bar")).toBeVisible();
  await teacherPage.screenshot({ fullPage: true, path: `${output}/materials-filters.png` });

  await teacherPage.goto("/#/teacher/analytics");
  await expect(teacherPage.locator(".analytics-filters select")).toHaveCount(1);
  await teacherPage.screenshot({ fullPage: true, path: `${output}/analytics-without-fake-selector.png` });
  await teacherContext.close();

  const mobileContext = await browser.newContext({ viewport: { width: 360, height: 800 } });
  const mobilePage = await mobileContext.newPage();
  await login(mobilePage, "test.teacher", "Teacher-test-2026!");
  await expect(mobilePage.getByTestId("teacher-shell")).toBeVisible();
  await mobilePage.getByRole("button", { name: "Ещё" }).click();
  await expect(mobilePage.getByRole("link", { name: "Материалы", exact: true })).toBeVisible();
  await mobilePage.screenshot({ path: `${output}/mobile-teacher-navigation.png` });
  await mobileContext.close();

  const studentContext = await browser.newContext({ viewport: { width: 360, height: 800 } });
  const studentPage = await studentContext.newPage();
  await login(studentPage, "test.student", "Student-test-2026!");
  await expect(studentPage.getByTestId("student-homework-title")).toHaveText("Доработать сочинение: аргументация");
  await studentPage.screenshot({ fullPage: true, path: `${output}/student-current-homework-revision.png` });
  await studentContext.close();
});
