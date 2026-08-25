import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, username: string, password: string, shell: "teacher" | "student") {
  await page.goto("/#/login");
  await page.getByLabel("Логин").fill(username);
  await page.getByLabel("Пароль").fill(password);
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page.getByTestId(`${shell}-shell`)).toBeVisible();
}

test("teacher AI creates an editable preview and confirms selected planner items once", async ({ page }) => {
  await login(page, "test.teacher", "Teacher-test-2026!", "teacher");
  await page.getByRole("button", { name: "Открыть AI-помощника" }).click();
  const dialog = page.getByRole("dialog", { name: "✨ AI-помощник преподавателя" });
  await dialog.getByLabel("Что подготовить?").fill("Запланируй на завтра: проверить сочинение Леры; купить бумагу домой");
  await dialog.getByRole("button", { name: "Подготовить черновик" }).click();
  await expect(dialog.getByText("Подготовлено задач: 2")).toBeVisible();
  await expect(dialog.getByLabel("Название задачи")).toHaveCount(2);
  await dialog.getByLabel("Название задачи").nth(1).fill("Купить бумагу и папки");
  await dialog.getByRole("button", { name: "Подтвердить выбранное" }).click();
  await expect(dialog.getByText(/Добавлено: 2/)).toBeVisible();
  await dialog.getByRole("button", { name: "Подтвердить выбранное" }).click();
  await expect(dialog.getByText(/Уже было подтверждено: 2/)).toBeVisible();
  await dialog.getByRole("button", { name: "Закрыть" }).click();
  await page.goto("/#/teacher/planner");
  await page.getByRole("button", { name: "→" }).click();
  await expect(page.getByText("Купить бумагу и папки")).toHaveCount(1);
});

test("student cannot discover AI controls", async ({ page }) => {
  await login(page, "test.student", "Student-test-2026!", "student");
  await expect(page.getByRole("button", { name: "Открыть AI-помощника" })).toHaveCount(0);
  await expect(page.getByText("AI-помощник преподавателя")).toHaveCount(0);
});

test("planner week and month use responsive overview models", async ({ page }) => {
  await login(page, "test.teacher", "Teacher-test-2026!", "teacher");
  await page.goto("/#/teacher/planner");
  await page.getByRole("button", { name: "Неделя" }).click();
  await expect(page.locator(".planner-week-card")).toHaveCount(7);
  await page.getByRole("button", { name: "Месяц" }).click();
  await expect(page.locator(".planner-month-cell")).toHaveCount(42);
  await page.locator(".planner-month-cell").first().click();
  await expect(page.getByTestId("planner-day")).toBeVisible();
});

test("backlog state persists and recurring edits require an explicit scope", async ({ page }) => {
  await login(page, "test.teacher", "Teacher-test-2026!", "teacher");
  await page.goto("/#/teacher/planner");
  const backlog = page.locator('.planner-category-column[data-category="Когда-нибудь"] .planner-backlog-heading');
  await expect(backlog).toHaveAttribute("aria-expanded", "false");
  await backlog.click();
  await expect(backlog).toHaveAttribute("aria-expanded", "true");
  await page.reload();
  await expect(page.locator('.planner-category-column[data-category="Когда-нибудь"] .planner-backlog-heading')).toHaveAttribute("aria-expanded", "true");

  await page.getByRole("button", { name: "+ Регулярная задача" }).click();
  let dialog = page.getByRole("dialog", { name: "Новая регулярная задача" });
  await dialog.getByLabel("Название").fill("Проверка scope регулярной задачи");
  await dialog.getByLabel("Повторять").selectOption("daily");
  await dialog.getByRole("button", { name: "Добавить регулярную задачу" }).click();
  const occurrence = page.locator(".planner-entry").filter({ hasText: "Проверка scope регулярной задачи" }).first();
  await occurrence.locator(".planner-entry-copy").click();
  dialog = page.getByRole("dialog", { name: "Изменить план" });
  await dialog.getByLabel("Название").fill("Scope подтверждён");
  await dialog.getByRole("button", { name: "Сохранить" }).click();
  const scopeDialog = page.getByRole("dialog", { name: "Какие повторения изменить?" });
  await expect(scopeDialog.getByRole("button", { name: "Только это повторение" })).toBeVisible();
  await expect(scopeDialog.getByRole("button", { name: "Это и следующие" })).toBeVisible();
  await expect(scopeDialog.getByRole("button", { name: "Вся серия" })).toBeVisible();
  await scopeDialog.getByRole("button", { name: "Только это повторение" }).click();
  await expect(page.getByText("Scope подтверждён")).toBeVisible();
});
