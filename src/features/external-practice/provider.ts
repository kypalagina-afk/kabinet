import type { ExamKind, ExternalPracticeProviderId } from "../../lib/firebase/types";

export interface ExternalPracticeProviderAttempt {
  sourceRecordId: string;
  externalStudentId?: string;
  examKind: ExamKind;
  taskNumber: number;
  score: number;
  maxScore: number;
  status: "completed" | "incomplete";
  practicedAt: Date;
  sourceUrl?: string;
}

export interface ExternalPracticeProvider {
  readonly id: ExternalPracticeProviderId;
  connect(): Promise<void>;
  testConnection(): Promise<void>;
  syncStudent(externalStudentId: string): Promise<void>;
  syncAttempts(externalStudentId: string): Promise<ExternalPracticeProviderAttempt[]>;
  syncTaskSnapshots(externalStudentId: string): Promise<void>;
}

// Russian100Provider will implement this contract only after the service owner
// supplies an approved API, export, webhook or data feed. The manual import does
// not authenticate against Russian100 and intentionally bypasses this contract.
