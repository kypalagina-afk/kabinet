import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, username: string, password: string, shell: "teacher" | "student") {
  await page.goto("/#/login");
  await page.getByLabel("Логин").fill(username);
  await page.getByLabel("Пароль").fill(password);
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page.getByTestId(`${shell}-shell`)).toBeVisible();
}

test("teacher manages an external material and student sees only the active program library", async ({ browser }) => {
  const teacherPage = await browser.newPage();
  const studentPage = await browser.newPage();
  await login(teacherPage, "test.teacher", "Teacher-test-2026!", "teacher");
  await login(studentPage, "test.student", "Student-test-2026!", "student");
  await teacherPage.getByRole("link", { name: "Материалы" }).click();
  await studentPage.getByRole("link", { name: "Материалы" }).click();

  await expect(studentPage.getByText("Пунктуация в сложном предложении")).toBeVisible();
  await expect(studentPage.getByText("Материал другой программы")).toHaveCount(0);
  await studentPage.getByRole("button", { name: "Тренировка" }).click();
  await expect(studentPage.getByText("Тренажёр задания №3")).toBeVisible();
  await expect(studentPage.getByText("Пунктуация в сложном предложении")).toHaveCount(0);
  await studentPage.getByRole("button", { name: "Все" }).click();

  await teacherPage.getByRole("button", { name: "+ Добавить материал" }).click();
  let form = teacherPage.getByRole("dialog").locator(".modal-form");
  await form.getByLabel("Название").fill("Новый тренажёр №5");
  await form.getByRole("textbox", { name: "Ссылка", exact: true }).fill("https://example.com/new-practice");
  await form.getByRole("combobox", { name: "Тип", exact: true }).selectOption("interactive");
  await form.getByRole("button", { name: "№5" }).click();
  await form.getByLabel("Теги").fill("тренировка");
  await form.getByRole("button", { name: "Сохранить" }).click();
  await expect(teacherPage.getByText(/Материал сохранён/)).toBeVisible();
  let teacherCard = teacherPage.locator(".material-list article").filter({ hasText: "Новый тренажёр №5" });
  await teacherCard.getByRole("button", { name: /Назначить/ }).click();
  const accessDialog = teacherPage.getByRole("dialog");
  await accessDialog.getByText("Тестовая ученица", { exact: true }).click();
  await accessDialog.getByRole("button", { name: "Подтвердить" }).click();
  await expect(studentPage.getByText("Новый тренажёр №5")).toBeVisible();

  teacherCard = teacherPage.locator(".material-list article").filter({ hasText: "Новый тренажёр №5" });
  await teacherCard.locator("summary").click();
  await teacherCard.getByRole("button", { name: "Изменить" }).click();
  form = teacherPage.getByRole("dialog").locator(".modal-form");
  await form.getByLabel("Название").fill("Обновлённый тренажёр №5");
  await form.getByRole("button", { name: "Сохранить" }).click();
  await expect(studentPage.getByText("Обновлённый тренажёр №5")).toBeVisible();

  teacherCard = teacherPage.locator(".material-list article").filter({ hasText: "Обновлённый тренажёр №5" });
  await teacherCard.getByRole("button", { name: "Архивировать" }).click();
  await expect(studentPage.getByText("Обновлённый тренажёр №5")).toHaveCount(0);
  await teacherPage.close();
  await studentPage.close();
});
