import {
  collection,
  doc,
  serverTimestamp,
  writeBatch,
  type Firestore,
} from "firebase/firestore";

export async function updateStudentProfile(
  db: Firestore,
  input: {
    teacherId: string;
    studentId: string;
    displayName: string;
    classGrade: number | null;
    avatarKey: string;
    conferenceUrl: string | null;
    secondaryConferenceUrl?: string | null;
  },
) {
  const batch = writeBatch(db);
  const conferenceLinks = [
    input.conferenceUrl
      ? {
          id: "primary",
          label: "Основная",
          provider: "zoom",
          joinUrl: input.conferenceUrl,
          isDefault: true,
        }
      : null,
    input.secondaryConferenceUrl
      ? {
          id: "secondary",
          label: "Дополнительная",
          provider: "other",
          joinUrl: input.secondaryConferenceUrl,
          isDefault: false,
        }
      : null,
  ].filter(Boolean);
  batch.update(doc(db, "students", input.studentId), {
    displayName: input.displayName.trim(),
    classGrade: input.classGrade,
    avatarKey: input.avatarKey,
    "defaultConference.joinUrl": input.conferenceUrl,
    conferenceLinks,
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(collection(db, "teacherAuditEvents")), {
    teacherId: input.teacherId,
    studentId: input.studentId,
    entityType: "student",
    entityId: input.studentId,
    action: "profile_updated",
    summary: "Карточка ученика обновлена",
    createdAt: serverTimestamp(),
    schemaVersion: 1,
  });
  await batch.commit();
}

export async function setStudentArchived(
  db: Firestore,
  input: { teacherId: string; studentId: string; archived: boolean },
) {
  const batch = writeBatch(db);
  batch.update(doc(db, "students", input.studentId), {
    status: input.archived ? "archived" : "active",
    archivedAt: input.archived ? serverTimestamp() : null,
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(collection(db, "teacherAuditEvents")), {
    teacherId: input.teacherId,
    studentId: input.studentId,
    entityType: "student",
    entityId: input.studentId,
    action: input.archived ? "archived" : "restored",
    summary: input.archived ? "Ученик архивирован" : "Ученик восстановлен",
    createdAt: serverTimestamp(),
    schemaVersion: 1,
  });
  await batch.commit();
}

export async function updateStudentConferenceLinks(
  db: Firestore,
  input: {
    teacherId: string;
    studentId: string;
    links: Array<{
      id: string;
      label: string;
      provider: "zoom" | "meet" | "other";
      joinUrl: string;
      isDefault: boolean;
    }>;
  },
) {
  const clean = input.links
    .filter((item) => item.label.trim() && item.joinUrl.trim())
    .map((item, index) => ({
      ...item,
      label: item.label.trim(),
      joinUrl: item.joinUrl.trim(),
      isDefault:
        index === input.links.findIndex((candidate) => candidate.isDefault),
    }));
  if (clean.length && !clean.some((item) => item.isDefault))
    clean[0]!.isDefault = true;
  const primary = clean.find((item) => item.isDefault) ?? null;
  const batch = writeBatch(db);
  batch.update(doc(db, "students", input.studentId), {
    conferenceLinks: clean,
    "defaultConference.provider":
      primary?.provider === "zoom" ? "zoom" : "other",
    "defaultConference.joinUrl": primary?.joinUrl ?? null,
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(collection(db, "teacherAuditEvents")), {
    teacherId: input.teacherId,
    studentId: input.studentId,
    entityType: "student",
    entityId: input.studentId,
    action: "conference_links_updated",
    summary: "Постоянные ссылки ученика обновлены",
    createdAt: serverTimestamp(),
    schemaVersion: 1,
  });
  await batch.commit();
}
