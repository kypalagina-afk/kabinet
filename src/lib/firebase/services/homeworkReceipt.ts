import { doc, runTransaction, serverTimestamp, Timestamp, type Firestore } from "firebase/firestore";
import type { Homework, HomeworkSubmission } from "../types.js";
import { deriveStructuredPackageStatus } from "../../../features/homework/homeworkWorkflowState.js";

export async function saveHomeworkReceipt(db: Firestore, input: {
  teacherId: string; homeworkId: string; submissionId: string;
  onTime: boolean | null;
  items: Record<string, { received: boolean; onTime: boolean | null }>;
}) {
  const homeworkRef = doc(db, "homeworks", input.homeworkId);
  const submissionRef = doc(db, "homeworkSubmissions", input.submissionId);
  await runTransaction(db, async (transaction) => {
    const [homeworkDoc, submissionDoc] = await Promise.all([transaction.get(homeworkRef), transaction.get(submissionRef)]);
    if (!homeworkDoc.exists() || !submissionDoc.exists()) throw new Error("ДЗ или попытка не найдены.");
    const homework = homeworkDoc.data() as Homework;
    const submission = submissionDoc.data() as HomeworkSubmission;
    if (homework.teacherId !== input.teacherId || submission.teacherId !== input.teacherId || submission.homeworkId !== input.homeworkId || submission.studentId !== homework.studentId) throw new Error("Нет доступа к этому ДЗ.");
    const receipt: NonNullable<HomeworkSubmission["teacherReceipt"]> = { onTime: input.onTime, items: {} };
    const progress = (homework.items ?? []).map((item) => {
      const value = input.items[item.itemId];
      if (!value || typeof value.received !== "boolean" || ![true, false, null].includes(value.onTime)) throw new Error("Укажите сдачу каждого пункта.");
      const old = submission.studentInput.itemProgress?.find((entry) => entry.itemId === item.itemId);
      const previous = submission.teacherReceipt?.items[item.itemId];
      receipt.items[item.itemId] = { ...value, receivedAt: value.received ? previous?.receivedAt ?? (old?.completed ? submission.submittedAt : null) ?? Timestamp.now() : null };
      return { itemId: item.itemId, selfReportedEarned: null, selfReportedMax: null, responseText: null, attachments: [], ...old, completed: value.received };
    });
    if (![true, false, null].includes(input.onTime)) throw new Error("Некорректная отметка срока.");
    const allReceived = progress.length ? progress.every((item) => item.completed) : submission.studentInput.completed;
    const status = progress.length ? deriveStructuredPackageStatus((homework.items ?? []).map((item) => item.itemId), (submission.teacherEvaluation?.itemEvaluations ?? []).filter((item) => receipt.items[item.itemId]?.received)) : submission.status;
    const evaluation = submission.teacherEvaluation;
    const counted = evaluation?.itemEvaluations?.filter((item) => receipt.items[item.itemId]?.received && item.scoreEarned !== null && item.scoreMax !== null) ?? [];
    transaction.update(submissionRef, {
      teacherReceipt: receipt,
      studentInput: { ...submission.studentInput, completed: allReceived, itemProgress: progress },
      ...(evaluation?.itemEvaluations?.length ? { teacherEvaluation: { ...evaluation,
        scoreEarned: counted.length ? counted.reduce((sum, item) => sum + (item.scoreEarned ?? 0), 0) : null,
        scoreMax: counted.length ? counted.reduce((sum, item) => sum + (item.scoreMax ?? 0), 0) : null,
        checkedAt: status === "checked" ? evaluation.checkedAt : null,
      } } : {}),
      status, updatedAt: serverTimestamp(),
    });
    transaction.update(homeworkRef, { status, updatedAt: serverTimestamp() });
  });
}
