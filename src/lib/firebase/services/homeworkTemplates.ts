import { collection, doc, onSnapshot, query, serverTimestamp, setDoc, where, type Firestore, type Unsubscribe } from "firebase/firestore";
import type { Attachment, DocumentWithId, Homework, HomeworkItem, HomeworkTemplate } from "../types";

export async function saveHomeworkTemplate(db: Firestore, input: { teacherId: string; title: string; items: HomeworkItem[]; attachments: Attachment[]; reviewCriteria?: Homework["reviewCriteria"] }) {
  const reference = doc(collection(db, "homeworkTemplates"));
  await setDoc(reference, { teacherId: input.teacherId, title: input.title.trim(), items: input.items.map((item, sortOrder) => ({ ...item, itemId: crypto.randomUUID(), sortOrder })), attachments: input.attachments, reviewCriteria: input.reviewCriteria ?? null, active: true, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), schemaVersion: 1 });
  return reference.id;
}

export function subscribeHomeworkTemplates(db: Firestore, teacherId: string, next: (templates: Array<DocumentWithId<HomeworkTemplate>>) => void): Unsubscribe {
  return onSnapshot(query(collection(db, "homeworkTemplates"), where("teacherId", "==", teacherId)), (snapshot) => next(snapshot.docs.map((item) => ({ id: item.id, data: item.data() as HomeworkTemplate })).filter(({ data }) => data.active).sort((a, b) => a.data.title.localeCompare(b.data.title, "ru"))));
}

export function homeworkDraftFromExisting(homework: Homework) {
  return { title: homework.title, description: homework.description ?? "", dueDate: "", dueTime: "", attachments: [...(homework.attachments ?? [])], items: (homework.items ?? []).map((item, sortOrder) => ({ ...item, itemId: crypto.randomUUID(), attachments: [...item.attachments], materialIds: [...item.materialIds], sortOrder })) };
}
