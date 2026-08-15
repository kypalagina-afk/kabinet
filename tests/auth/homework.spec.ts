import { expect, test, type Page } from "@playwright/test";

const teacher = { username: "test.teacher", password: "Teacher-test-2026!" };
const student = { username: "test.student", password: "Student-test-2026!" };

async function login(page: Page, credentials: typeof teacher, shell: "teacher" | "student") {
  await page.goto("/#/login");
  await page.getByLabel("Логин").fill(credentials.username);
  await page.getByLabel("Пароль").fill(credentials.password);
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page.getByTestId(`${shell}-shell`)).toBeVisible();
}

test("student submits practice, teacher requests revision, and student retries", async ({
  browser,
}) => {
  const studentPage = await browser.newPage();
  await login(studentPage, student, "student");
  await studentPage.getByRole("link", { name: "ДЗ" }).click();
  const studentCard = studentPage
    .getByTestId("homework-card")
    .filter({ hasText: "Практика: задания №2–5" });
  await studentCard.getByRole("button", { name: /Практика: задания №2–5/ }).click();
  await studentCard.getByRole("checkbox").check();
  await studentCard.getByLabel(/Комментарий для преподавателя/).fill("Задание №3 вызвало вопрос");
  await studentCard.getByRole("button", { name: "Отправить работу" }).click();
  await expect(studentCard.getByText("На проверке")).toBeVisible();

  const teacherPage = await browser.newPage();
  await login(teacherPage, teacher, "teacher");
  await teacherPage.getByRole("link", { name: "Домашние задания" }).click();
  await teacherPage.getByRole("button", { name: "На проверке" }).click();
  const teacherCard = teacherPage
    .getByTestId("teacher-homework-card")
    .filter({ hasText: "Практика: задания №2–5" });
  await teacherCard.click();
  const reviewDialog = teacherPage.getByRole("dialog");
  await expect(reviewDialog.getByText("Задание №3 вызвало вопрос")).toBeVisible();
  await reviewDialog.getByLabel(/Результат/).fill("2");
  await reviewDialog.getByLabel(/Комментарий ученику/).fill("Повтори правило и исправь №3");
  await reviewDialog.getByRole("button", { name: "Вернуть на доработку" }).click();
  await expect(studentCard.getByText("Нужна доработка", { exact: true })).toBeVisible();
  await expect(studentCard.getByText("Результат: 2/4")).toBeVisible();
  await reviewDialog.getByRole("button", { name: "Создать ДЗ на доработку" }).click();
  await expect(teacherPage.getByText("Найден незавершённый черновик.")).toBeVisible();

  await studentCard.getByRole("checkbox").check();
  await studentCard.getByRole("button", { name: "Отправить повторно" }).click();
  await expect(studentCard.getByText("На проверке")).toBeVisible();

  await studentPage.close();
  await teacherPage.close();
});
