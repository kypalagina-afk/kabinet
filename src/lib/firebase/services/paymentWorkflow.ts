import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  where,
  type Firestore,
} from "firebase/firestore";
import { allocateLessonCredits } from "../../../features/payments/allocation";
import type { Lesson, StudentPaymentAccount } from "../types";

export async function previewPaymentAllocation(
  db: Firestore,
  teacherId: string,
  studentId: string,
  addedCredits: number,
) {
  const snapshot = await getDocs(
    query(
      collection(db, "lessons"),
      where("teacherId", "==", teacherId),
      where("studentId", "==", studentId),
    ),
  );
  const lessons = snapshot.docs.map((item) => ({
    id: item.id,
    data: item.data() as Lesson,
  }));
  const paidLegacy = lessons.filter(
    ({ data }) =>
      data.paymentStatus === "paid" &&
      (data.status === "planned" || data.status === "completed"),
  ).length;
  const accountRef = doc(db, "studentPaymentAccounts", studentId);
  const accountSnapshot = await getDoc(accountRef);
  const account = accountSnapshot.exists()
    ? (accountSnapshot.data() as StudentPaymentAccount)
    : null;
  const base = account
    ? account.reconciledFromLegacyPaidCount + account.purchasedLessonCredits
    : paidLegacy;
  const manual = new Set(account?.manualPaidBillingIds ?? []);
  const allocation = allocateLessonCredits(
    lessons
      .filter(({ id, data }) => !manual.has(data.billingIdentityId ?? id))
      .map(({ id, data }) => ({
        id,
        startMs: data.startAt.toMillis(),
        status: data.status,
        paymentStatus: data.paymentStatus,
        billingType: data.billingType,
        billingIdentityId: data.billingIdentityId,
      })),
    base + addedCredits,
  );
  return {
    lessons,
    account,
    legacyPaidCount: paidLegacy,
    totalCredits: base + addedCredits,
    ...allocation,
  };
}

export async function addPaymentCredits(
  db: Firestore,
  input: {
    teacherId: string;
    studentId: string;
    lessonCount: number;
    note?: string | null;
  },
) {
  if (
    !Number.isInteger(input.lessonCount) ||
    input.lessonCount < 1 ||
    input.lessonCount > 100
  )
    throw new Error("Количество занятий должно быть от 1 до 100");
  const preview = await previewPaymentAllocation(
    db,
    input.teacherId,
    input.studentId,
    input.lessonCount,
  );
  const accountRef = doc(db, "studentPaymentAccounts", input.studentId);
  const eventRef = doc(collection(db, "paymentCreditEvents"));
  await runTransaction(db, async (transaction) => {
    const [accountSnapshot, ...lessonSnapshots] = await Promise.all([
      transaction.get(accountRef),
      ...preview.lessons.map((lesson) =>
        transaction.get(doc(db, "lessons", lesson.id)),
      ),
    ]);
    const existing = accountSnapshot.exists()
      ? (accountSnapshot.data() as StudentPaymentAccount)
      : null;
    if (
      existing &&
      (existing.teacherId !== input.teacherId ||
        existing.studentId !== input.studentId)
    )
      throw new Error("Payment account ownership mismatch");
    const legacy =
      existing?.reconciledFromLegacyPaidCount ?? preview.legacyPaidCount;
    const purchased =
      (existing?.purchasedLessonCredits ?? 0) + input.lessonCount;
    const manual = new Set(existing?.manualPaidBillingIds ?? []);
    const allocation = allocateLessonCredits(
      lessonSnapshots
        .filter(
          (item) =>
            item.exists() &&
            !manual.has((item.data() as Lesson).billingIdentityId ?? item.id),
        )
        .map((item) => {
          const lesson = item.data() as Lesson;
          return {
            id: item.id,
            startMs: lesson.startAt.toMillis(),
            status: lesson.status,
            paymentStatus: lesson.paymentStatus,
            billingType: lesson.billingType,
            billingIdentityId: lesson.billingIdentityId,
          };
        }),
      legacy + purchased,
    );
    const paid = new Set(allocation.paidIds);
    const paidIds: string[] = [];
    lessonSnapshots.forEach((snapshot) => {
      if (!snapshot.exists()) return;
      const lesson = snapshot.data() as Lesson;
      if (
        (lesson.status !== "planned" && lesson.status !== "completed") ||
        lesson.billingType === "free" ||
        lesson.paymentStatus === "free"
      )
        return;
      const isPaid =
        manual.has(lesson.billingIdentityId ?? snapshot.id) ||
        paid.has(snapshot.id);
      if (isPaid) paidIds.push(snapshot.id);
      transaction.update(snapshot.ref, {
        paymentStatus: isPaid ? "paid" : "unpaid",
        updatedAt: serverTimestamp(),
      });
    });
    transaction.set(
      accountRef,
      {
        teacherId: input.teacherId,
        studentId: input.studentId,
        purchasedLessonCredits: purchased,
        reconciledFromLegacyPaidCount: legacy,
        lastAllocationLessonIds: paidIds,
        manualPaidBillingIds: [...manual],
        createdAt: existing?.createdAt ?? serverTimestamp(),
        updatedAt: serverTimestamp(),
        schemaVersion: 1,
      },
      { merge: true },
    );
    transaction.set(eventRef, {
      teacherId: input.teacherId,
      studentId: input.studentId,
      lessonCount: input.lessonCount,
      note: input.note?.trim() || null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      schemaVersion: 1,
    });
  });
  return preview;
}

export async function setLessonPaymentStatus(
  db: Firestore,
  input: {
    teacherId: string;
    studentId: string;
    lessonId: string;
    paymentStatus: "paid" | "unpaid" | "free";
  },
) {
  const snapshot = await getDocs(
    query(
      collection(db, "lessons"),
      where("teacherId", "==", input.teacherId),
      where("studentId", "==", input.studentId),
    ),
  );
  const lessonRefs = snapshot.docs.map((item) => item.ref);
  const accountRef = doc(db, "studentPaymentAccounts", input.studentId);
  await runTransaction(db, async (transaction) => {
    const [accountSnapshot, ...lessonSnapshots] = await Promise.all([
      transaction.get(accountRef),
      ...lessonRefs.map((reference) => transaction.get(reference)),
    ]);
    const targetSnapshot = lessonSnapshots.find(
      (item) => item.id === input.lessonId,
    );
    if (!targetSnapshot?.exists()) throw new Error("Lesson does not exist");
    const target = targetSnapshot.data() as Lesson;
    if (
      target.teacherId !== input.teacherId ||
      target.studentId !== input.studentId
    )
      throw new Error("Lesson ownership mismatch");
    const account = accountSnapshot.exists()
      ? (accountSnapshot.data() as StudentPaymentAccount)
      : null;
    if (
      account &&
      (account.teacherId !== input.teacherId ||
        account.studentId !== input.studentId)
    )
      throw new Error("Payment account ownership mismatch");
    const identity = target.billingIdentityId ?? input.lessonId;
    const manual = new Set(account?.manualPaidBillingIds ?? []);
    if (input.paymentStatus === "paid") manual.add(identity);
    else manual.delete(identity);
    const active = lessonSnapshots
      .filter((item) => item.exists())
      .map((item) => ({ snapshot: item, lesson: item.data() as Lesson }));
    const legacy =
      account?.reconciledFromLegacyPaidCount ??
      active.filter(
        ({ lesson }) =>
          lesson.paymentStatus === "paid" &&
          !manual.has(lesson.billingIdentityId ?? "") &&
          (lesson.status === "planned" || lesson.status === "completed"),
      ).length;
    const purchased = account?.purchasedLessonCredits ?? 0;
    const allocation = allocateLessonCredits(
      active
        .filter(({ lesson }) => !manual.has(lesson.billingIdentityId ?? ""))
        .map(({ snapshot: item, lesson }) => ({
          id: item.id,
          startMs: lesson.startAt.toMillis(),
          status: lesson.status,
          paymentStatus: lesson.paymentStatus,
          billingType: lesson.billingType,
          billingIdentityId: lesson.billingIdentityId,
        })),
      legacy + purchased,
    );
    const allocated = new Set(allocation.paidIds);
    const paidIds: string[] = [];
    active.forEach(({ snapshot: item, lesson }) => {
      if (lesson.status !== "planned" && lesson.status !== "completed") return;
      const lessonIdentity = lesson.billingIdentityId ?? item.id;
      const isTarget = item.id === input.lessonId;
      const free =
        (isTarget && input.paymentStatus === "free") ||
        (lesson.paymentStatus === "free" && !isTarget);
      const paid = manual.has(lessonIdentity) || allocated.has(item.id);
      const paymentStatus = free ? "free" : paid ? "paid" : "unpaid";
      if (paid) paidIds.push(item.id);
      transaction.update(item.ref, {
        paymentStatus,
        ...(isTarget
          ? { billingType: input.paymentStatus === "free" ? "free" : "regular" }
          : {}),
        updatedAt: serverTimestamp(),
      });
    });
    transaction.set(
      accountRef,
      {
        teacherId: input.teacherId,
        studentId: input.studentId,
        purchasedLessonCredits: purchased,
        reconciledFromLegacyPaidCount: legacy,
        lastAllocationLessonIds: paidIds,
        manualPaidBillingIds: [...manual],
        createdAt: account?.createdAt ?? serverTimestamp(),
        updatedAt: serverTimestamp(),
        schemaVersion: 1,
      },
      { merge: true },
    );
  });
}
