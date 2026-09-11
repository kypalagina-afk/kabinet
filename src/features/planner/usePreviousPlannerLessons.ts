import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query, Timestamp, where } from "firebase/firestore";
import { getFirebaseDb } from "../../lib/firebase/client";
import type { DocumentWithId, Lesson } from "../../lib/firebase/types";

// Independent of the visible calendar range: unfinished work may be older than
// the selected week/month. The lesson's actual date is never changed.
export function usePreviousPlannerLessons(teacherId: string, beforeMillis: number) {
  const [state, setState] = useState({ teacherId: "", data: [] as Array<DocumentWithId<Lesson>>, error: "" });
  useEffect(() => {
    if (!teacherId) return;
    return onSnapshot(query(collection(getFirebaseDb(), "lessons"),
      where("teacherId", "==", teacherId), where("startAt", "<", Timestamp.fromMillis(beforeMillis)), orderBy("startAt", "asc")),
    (snapshot) => setState({ teacherId, data: snapshot.docs.map((item) => ({ id: item.id, data: item.data() as Lesson })), error: "" }),
    () => setState({ teacherId, data: [], error: "Не удалось загрузить незавершённые задачи прошлых дней." }));
  }, [teacherId, beforeMillis]);
  return state.teacherId === teacherId ? state : { data: [], error: "" };
}
