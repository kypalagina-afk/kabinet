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

test("teacher writes homework and mock exam, student receives both in realtime", async ({
  browser,
}) => {
  const teacherContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const studentContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const teacherPage = await teacherContext.newPage();
  const studentPage = await studentContext.newPage();

  await login(studentPage, studentCredentials);
  await expect(studentPage.getByTestId("student-program-title")).toHaveText(
    "ОГЭ · Русский язык · 2027",
  );
  await expect(studentPage.getByTestId("student-goal")).toHaveText("ОГЭ на 4");
  await expect(studentPage.getByTestId("student-lesson")).toContainText(
    "Тестовое занятие по пунктуации",
  );
  await expect(studentPage.getByTestId("student-homework-title")).toHaveText(
    "Сочинение · проверка по критериям",
  );
  await expect(studentPage.getByTestId("student-mock-title")).toHaveText(
    "Тестовый исходный пробник",
  );

  await login(teacherPage, teacherCredentials);
  const pilotCard = teacherPage.getByTestId("student-card").filter({ hasText: "Тестовая ученица" });
  await expect(pilotCard).toContainText(
    "Тестовая ученица",
  );
  await pilotCard.click();
  await expect(teacherPage.getByRole("heading", { name: "Тестовая ученица" })).toBeVisible();
  await expect(teacherPage.getByTestId("teacher-program-title")).toHaveText(
    "ОГЭ · Русский язык · 2027",
  );

  const homeworkTitle = `Realtime ДЗ ${Date.now()}`;
  await teacherPage.locator('input[name="homeworkTitle"]').fill(homeworkTitle);
  await teacherPage
    .locator('textarea[name="homeworkDescription"]')
    .fill("Это обновление должно появиться без перезагрузки.");
  await teacherPage.locator('input[name="homeworkDueDate"]').fill("2099-12-31");
  await teacherPage.getByRole("button", { name: "Назначить ДЗ" }).click();
  await expect(teacherPage.getByRole("heading", { name: "Домашнее задание назначено" })).toBeVisible();
  await expect(studentPage.getByTestId("student-homework-title")).toHaveText(
    homeworkTitle,
  );

  const mockTitle = `Realtime пробник ${Date.now()}`;
  await teacherPage.locator('input[name="mockTitle"]').fill(mockTitle);
  await teacherPage.locator('input[name="mockDate"]').fill("2099-12-30");
  for (let taskNumber = 2; taskNumber <= 12; taskNumber += 1) {
    await teacherPage.getByLabel(`Задание №${taskNumber}`).fill("1");
  }
  for (const [code, value] of [["ИК1", "2"], ["ИК2", "2"], ["ИК3", "2"], ["СК1", "1"], ["СК2", "3"], ["СК3", "2"], ["СК4", "1"], ["ГК1", "3"], ["ГК2", "3"]] as const) {
    await teacherPage.getByLabel(`${code} балл`).fill(value);
  }
  await teacherPage.getByRole("button", { name: "Сохранить пробник" }).click();
  await expect(teacherPage.getByText("Пробник сохранён")).toBeVisible();
  await expect(studentPage.getByTestId("student-mock-title")).toHaveText(mockTitle);
  await expect(studentPage.getByTestId("student-mock-card")).toContainText("30/37");
  await expect(studentPage.getByTestId("student-mock-card")).toContainText("Оценка 4");
  await studentPage.getByRole("link", { name: "Открыть профиль" }).click();
  const xpTotal = studentPage.locator(".xp-panel > div > strong");
  await expect(xpTotal).toHaveText(/^[1-9]\d* XP$/);
  const xpText = await xpTotal.innerText();
  expect(Number.parseInt(xpText, 10)).toBeGreaterThanOrEqual(250);

  await teacherContext.close();
  await studentContext.close();
});
