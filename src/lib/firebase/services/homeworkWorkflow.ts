import {
  doc,
  runTransaction,
  serverTimestamp,
  Timestamp,
  type Firestore,
} from "firebase/firestore";
import type {
  EvaluationCriterion,
  Homework,
  HomeworkSubmission,
  StudentInput,
  TeacherEvaluation,
  HomeworkItemEvaluation,
} from "../types.js";
import { deriveStructuredPackageStatus } from "../../../features/homework/homeworkWorkflowState.js";

export interface HomeworkWorkflowResult {
  status: "applied" | "noop";
  submissionId: string;
}

export function homeworkSubmissionId(
  homeworkId: string,
  submissionNumber: number,
): string {
  if (!homeworkId || homeworkId.includes("/") || submissionNumber < 1) {
    throw new Error("Invalid homework submission identity");
  }
  return `${homeworkId}__submission__${submissionNumber}`;
}

function normalizedStudentInput(input: StudentInput): StudentInput {
  const note = input.note?.trim() || null;
  if (
    input.selfReportedEarned !== null &&
    (input.selfReportedMax === null ||
      input.selfReportedMax <= 0 ||
      input.selfReportedEarned < 0 ||
      input.selfReportedEarned > input.selfReportedMax)
  ) {
    throw new Error("Self-reported result is invalid");
  }
  return {
    completed: input.completed,
    selfReportedEarned: input.selfReportedEarned,
    selfReportedMax: input.selfReportedMax,
    note,
    externalAttachmentUrls: [],
    attachments: input.attachments ?? [],
    itemProgress: input.itemProgress ?? [],
  };
}

function sameStudentInput(left: StudentInput, right: StudentInput): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export async function submitHomework(
  db: Firestore,
  input: {
    homeworkId: string;
    teacherId: string;
    studentId: string;
    submissionNumber: number;
    studentInput: StudentInput;
  },
): Promise<HomeworkWorkflowResult> {
  const submissionId = homeworkSubmissionId(
    input.homeworkId,
    input.submissionNumber,
  );
  const homeworkReference = doc(db, "homeworks", input.homeworkId);
  const submissionReference = doc(db, "homeworkSubmissions", submissionId);
  const previousReference =
    input.submissionNumber > 1
      ? doc(
          db,
          "homeworkSubmissions",
          homeworkSubmissionId(input.homeworkId, input.submissionNumber - 1),
        )
      : null;
  const studentInput = normalizedStudentInput(input.studentInput);

  return runTransaction(db, async (transaction) => {
    const [homeworkSnapshot, submissionSnapshot, previousSnapshot] =
      await Promise.all([
        transaction.get(homeworkReference),
        transaction.get(submissionReference),
        previousReference
          ? transaction.get(previousReference)
          : Promise.resolve(null),
      ]);
    if (!homeworkSnapshot.exists()) throw new Error("Homework does not exist");
    const homework = homeworkSnapshot.data() as Homework;
    if (
      homework.teacherId !== input.teacherId ||
      homework.studentId !== input.studentId
    ) {
      throw new Error("Homework ownership check failed");
    }

    if (submissionSnapshot.exists()) {
      const existing = submissionSnapshot.data() as HomeworkSubmission;
      if (
        existing.homeworkId === input.homeworkId &&
        existing.studentId === input.studentId &&
        sameStudentInput(existing.studentInput, studentInput)
      ) {
        return { status: "noop" as const, submissionId };
      }
      throw new Error("Submission number is already used");
    }

    if (input.submissionNumber === 1) {
      if (
        !new Set<Homework["status"]>(["assigned", "overdue"]).has(
          homework.status,
        )
      ) {
        throw new Error("Homework is not open for its first submission");
      }
    } else {
      if (
        !previousSnapshot?.exists() ||
        (previousSnapshot.data() as HomeworkSubmission).status !==
          "needs_revision" ||
        homework.status !== "needs_revision"
      ) {
        throw new Error("A revision was not requested");
      }
    }

    transaction.set(submissionReference, {
      teacherId: input.teacherId,
      studentId: input.studentId,
      homeworkId: input.homeworkId,
      submissionNumber: input.submissionNumber,
      studentInput,
      teacherEvaluation: null,
      status: "submitted",
      submittedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      schemaVersion: 1,
    });
    transaction.update(homeworkReference, {
      status: "submitted",
      updatedAt: serverTimestamp(),
    });
    return { status: "applied" as const, submissionId };
  });
}

function normalizeCriteria(criteria: EvaluationCriterion[]) {
  for (const criterion of criteria) {
    if (
      !criterion.code.trim() ||
      criterion.max < 0 ||
      criterion.earned < 0 ||
      criterion.earned > criterion.max ||
      (criterion.errorsCount !== null && criterion.errorsCount < 0)
    ) {
      throw new Error("Evaluation criterion is invalid");
    }
  }
  return criteria.map((criterion) => ({
    ...criterion,
    code: criterion.code.trim(),
  }));
}

export async function evaluateHomeworkSubmission(
  db: Firestore,
  input: {
    homeworkId: string;
    submissionId: string;
    teacherId: string;
    decision: "checked" | "needs_revision";
    scoreEarned: number | null;
    scoreMax: number | null;
    criteria: EvaluationCriterion[];
    comment: string | null;
  },
): Promise<HomeworkWorkflowResult> {
  if (
    input.scoreEarned !== null &&
    (input.scoreMax === null ||
      input.scoreMax <= 0 ||
      input.scoreEarned < 0 ||
      input.scoreEarned > input.scoreMax)
  ) {
    throw new Error("Teacher score is invalid");
  }
  const criteria = normalizeCriteria(input.criteria);
  const homeworkReference = doc(db, "homeworks", input.homeworkId);
  const submissionReference = doc(
    db,
    "homeworkSubmissions",
    input.submissionId,
  );
  const xpEventReference = doc(
    db,
    "gamificationEvents",
    `homework_completed__${input.homeworkId}`,
  );

  return runTransaction(db, async (transaction) => {
    const [homeworkSnapshot, submissionSnapshot, xpEventSnapshot] =
      await Promise.all([
        transaction.get(homeworkReference),
        transaction.get(submissionReference),
        input.decision === "checked"
          ? transaction.get(xpEventReference)
          : Promise.resolve(null),
      ]);
    if (!homeworkSnapshot.exists() || !submissionSnapshot.exists()) {
      throw new Error("Homework submission does not exist");
    }
    const homework = homeworkSnapshot.data() as Homework;
    const submission = submissionSnapshot.data() as HomeworkSubmission;
    if (
      homework.teacherId !== input.teacherId ||
      submission.teacherId !== input.teacherId ||
      submission.homeworkId !== input.homeworkId ||
      submission.studentId !== homework.studentId
    ) {
      throw new Error("Homework evaluation ownership check failed");
    }
    if (submission.status !== "submitted") {
      throw new Error("Only a submitted attempt can be evaluated");
    }

    const achievementCodes =
      input.decision === "checked"
        ? [
            "first-step",
            ...(submission.submissionNumber > 1 ? ["comeback"] : []),
            ...(homework.dueAt &&
            submission.submittedAt &&
            submission.submittedAt.toMillis() <= homework.dueAt.toMillis()
              ? ["on-time"]
              : []),
          ]
        : [];
    const achievementReferences = achievementCodes.map((code) =>
      doc(db, "studentAchievements", `${homework.studentProgramId}__${code}`),
    );
    const achievementSnapshots = await Promise.all(
      achievementReferences.map((reference) => transaction.get(reference)),
    );

    const teacherEvaluation: Omit<TeacherEvaluation, "checkedAt"> & {
      checkedAt: ReturnType<typeof serverTimestamp>;
    } = {
      scoreEarned: input.scoreEarned,
      scoreMax: input.scoreMax,
      criteria,
      issues: [],
      comment: input.comment?.trim() || null,
      checkedAt: serverTimestamp(),
    };
    transaction.update(submissionReference, {
      teacherEvaluation,
      status: input.decision,
      reviewedUnread: input.decision === "checked",
      reviewedOpenedAt: null,
      updatedAt: serverTimestamp(),
    });
    transaction.update(homeworkReference, {
      status: input.decision,
      updatedAt: serverTimestamp(),
    });
    if (input.decision === "checked" && !xpEventSnapshot?.exists()) {
      transaction.set(xpEventReference, {
        teacherId: homework.teacherId,
        studentId: homework.studentId,
        studentProgramId: homework.studentProgramId,
        eventType: "homework_completed",
        sourceType: "homework",
        sourceId: input.homeworkId,
        xpDelta: 50,
        createdAt: serverTimestamp(),
        schemaVersion: 1,
      });
    }
    achievementReferences.forEach((reference, index) => {
      if (achievementSnapshots[index]?.exists()) return;
      transaction.set(reference, {
        teacherId: homework.teacherId,
        studentId: homework.studentId,
        studentProgramId: homework.studentProgramId,
        achievementDefinitionId: achievementCodes[index],
        earnedAt: serverTimestamp(),
        metadata: { sourceType: "homework", sourceId: input.homeworkId },
        schemaVersion: 1,
      });
    });
    return { status: "applied" as const, submissionId: input.submissionId };
  });
}

export async function evaluateHomeworkItem(
  db: Firestore,
  input: {
    homeworkId: string;
    submissionId: string;
    teacherId: string;
    itemId: string;
    decision: "checked" | "needs_revision";
    scoreEarned: number | null;
    scoreMax: number | null;
    criteria: EvaluationCriterion[];
    comment: string | null;
  },
): Promise<HomeworkWorkflowResult> {
  if (
    input.scoreEarned !== null &&
    (input.scoreMax === null ||
      input.scoreMax <= 0 ||
      input.scoreEarned < 0 ||
      input.scoreEarned > input.scoreMax)
  )
    throw new Error("Teacher score is invalid");
  const criteria = normalizeCriteria(input.criteria);
  const homeworkReference = doc(db, "homeworks", input.homeworkId);
  const submissionReference = doc(
    db,
    "homeworkSubmissions",
    input.submissionId,
  );
  const xpEventReference = doc(
    db,
    "gamificationEvents",
    `homework_completed__${input.homeworkId}`,
  );
  return runTransaction(db, async (transaction) => {
    const [homeworkSnapshot, submissionSnapshot, xpSnapshot] =
      await Promise.all([
        transaction.get(homeworkReference),
        transaction.get(submissionReference),
        transaction.get(xpEventReference),
      ]);
    if (!homeworkSnapshot.exists() || !submissionSnapshot.exists())
      throw new Error("Homework submission does not exist");
    const homework = homeworkSnapshot.data() as Homework;
    const submission = submissionSnapshot.data() as HomeworkSubmission;
    if (
      homework.teacherId !== input.teacherId ||
      submission.teacherId !== input.teacherId ||
      submission.homeworkId !== input.homeworkId ||
      submission.studentId !== homework.studentId
    )
      throw new Error("Homework evaluation ownership check failed");
    if (!homework.items?.some((item) => item.itemId === input.itemId))
      throw new Error("Homework item does not exist");
    if (!new Set(["submitted", "needs_revision"]).has(submission.status))
      throw new Error("Only an active submitted attempt can be evaluated");
    const itemEvaluation: HomeworkItemEvaluation = {
      itemId: input.itemId,
      scoreEarned: input.scoreEarned,
      scoreMax: input.scoreMax,
      criteria,
      comment: input.comment?.trim() || null,
      reviewStatus: input.decision,
      checkedAt: Timestamp.now(),
    };
    const previous = submission.teacherEvaluation?.itemEvaluations ?? [];
    const itemEvaluations = [
      ...previous.filter((item) => item.itemId !== input.itemId),
      itemEvaluation,
    ];
    const requiredItemIds = (homework.items ?? [])
      .filter((item) =>
        item.type === "essay" ||
        item.type === "exposition" ||
        item.type === "exam_written_work",
      )
      .map((item) => item.itemId);
    const packageStatus = deriveStructuredPackageStatus(
      requiredItemIds,
      itemEvaluations,
    );
    const numeric = itemEvaluations.filter(
      (item) => item.scoreEarned !== null && item.scoreMax !== null,
    );
    const teacherEvaluation = {
      scoreEarned: numeric.length
        ? numeric.reduce((sum, item) => sum + (item.scoreEarned ?? 0), 0)
        : null,
      scoreMax: numeric.length
        ? numeric.reduce((sum, item) => sum + (item.scoreMax ?? 0), 0)
        : null,
      criteria: itemEvaluations.flatMap((item) => item.criteria),
      issues: [],
      comment: null,
      checkedAt: packageStatus === "checked" ? serverTimestamp() : null,
      itemEvaluations,
    };
    transaction.update(submissionReference, {
      teacherEvaluation,
      status: packageStatus,
      reviewedUnread: packageStatus === "checked",
      reviewedOpenedAt: null,
      updatedAt: serverTimestamp(),
    });
    transaction.update(homeworkReference, {
      status: packageStatus,
      updatedAt: serverTimestamp(),
    });
    if (packageStatus === "checked" && !xpSnapshot.exists())
      transaction.set(xpEventReference, {
        teacherId: homework.teacherId,
        studentId: homework.studentId,
        studentProgramId: homework.studentProgramId,
        eventType: "homework_completed",
        sourceType: "homework",
        sourceId: input.homeworkId,
        xpDelta: 50,
        createdAt: serverTimestamp(),
        schemaVersion: 1,
      });
    return { status: "applied", submissionId: input.submissionId };
  });
}

export async function markHomeworkReviewOpened(
  db: Firestore,
  submissionId: string,
  studentId: string,
) {
  const reference = doc(db, "homeworkSubmissions", submissionId);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists()) throw new Error("Submission does not exist");
    const submission = snapshot.data() as HomeworkSubmission;
    if (submission.studentId !== studentId || submission.status !== "checked")
      throw new Error("Review is not available");
    if (submission.reviewedUnread === false) return;
    transaction.update(reference, {
      reviewedUnread: false,
      reviewedOpenedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
}
