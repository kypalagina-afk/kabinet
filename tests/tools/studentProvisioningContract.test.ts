import { describe, expect, test } from "vitest";
import type { User } from "firebase/auth";
import {
  productionStudentProvisioningService,
  type StudentProvisioningInput,
} from "../../src/lib/firebase/services/studentProvisioning.js";

const input: StudentProvisioningInput = {
  displayName: "Новая ученица",
  classGrade: 8,
  programProfileId: "oge-russian-2027",
  goal: "ОГЭ на 4",
  timezone: "Europe/Moscow",
  username: "new.student",
  password: "Secret-2026!",
  conferenceUrl: "",
};

describe("production provisioning contract", () => {
  test("fails closed instead of creating Auth users from a teacher browser session", async () => {
    await expect(
      productionStudentProvisioningService.create({} as User, input),
    ).rejects.toThrow("защищённый backend");
    await expect(
      productionStudentProvisioningService.resetPassword(
        {} as User,
        "student-id",
        "Another-2026!",
      ),
    ).rejects.toThrow("защищённый backend");
    await expect(
      productionStudentProvisioningService.updateCredentials(
        {} as User,
        "student-id",
        { username: "updated.student", password: "Another-2026!" },
      ),
    ).rejects.toThrow("защищённый backend");
  });
});
