import type { User } from "firebase/auth";
import { backendRequest } from "../../backend/apiClient.js";
import { isProductionBackendAvailable, isUsingFirebaseEmulators } from "../client.js";

export interface StudentProvisioningInput {
  displayName: string;
  classGrade: number;
  programProfileId: string;
  goal: string;
  timezone: string;
  username: string;
  password: string;
  conferenceUrl: string;
  avatarKey?: string;
  scheduleWeekday?: number;
  scheduleTime?: string;
  scheduleDuration?: number;
}

export interface StudentProvisioningService {
  create(user: User, input: StudentProvisioningInput): Promise<{ studentId: string; username: string }>;
  resetPassword(user: User, studentId: string, password: string): Promise<void>;
}

async function request(user: User, body: Record<string, unknown>) {
  if (!isUsingFirebaseEmulators()) throw new Error("Production student provisioning requires a protected backend/Admin SDK callable service.");
  const response = await fetch("/__emulator/student-provisioning", { method: "POST", headers: { authorization: `Bearer ${await user.getIdToken()}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json() as { error?: string; studentId?: string; username?: string };
  if (!response.ok) throw new Error(result.error ?? "Provisioning failed");
  return result;
}

export const localStudentProvisioningService: StudentProvisioningService = {
  async create(user, input) {
    const result = await request(user, { action: "create", ...input });
    if (!result.studentId || !result.username) throw new Error("Provisioning response is incomplete");
    return { studentId: result.studentId, username: result.username };
  },
  async resetPassword(user, studentId, password) { await request(user, { action: "reset-password", studentId, password }); },
};

export const productionStudentProvisioningService: StudentProvisioningService = {
  async create(user, input) {
    if (!isProductionBackendAvailable()) throw new Error("Production provisioning недоступен: защищённый backend не настроен.");
    return backendRequest<{ studentId: string; username: string }>("/v1/students", {
      method: "POST",
      user,
      body: input,
    });
  },
  async resetPassword(user, studentId, password) {
    if (!isProductionBackendAvailable()) throw new Error("Production provisioning недоступен: защищённый backend не настроен.");
    await backendRequest(`/v1/students/${encodeURIComponent(studentId)}/password`, {
      method: "POST",
      user,
      body: { password },
    });
  },
};

export function getStudentProvisioningService(): StudentProvisioningService {
  return isUsingFirebaseEmulators()
    ? localStudentProvisioningService
    : productionStudentProvisioningService;
}

export function generateStudentPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const values = crypto.getRandomValues(new Uint32Array(12));
  return `${[...values].map((value) => alphabet[value % alphabet.length]).join("")}!`;
}
