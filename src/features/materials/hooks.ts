import { useEffect, useState } from "react";
import { getFirebaseDb } from "../../lib/firebase/client";
import {
  subscribeStudentMaterials,
  subscribeTeacherMaterials,
  subscribeProgramProfiles,
  subscribeExamBlueprints,
  subscribeMaterialFolders,
  subscribeStudentMaterialFolders,
} from "../../lib/firebase/repositories/materialsRepository";
import type { DocumentWithId, ExamBlueprint, Material, MaterialFolder, ProgramProfile } from "../../lib/firebase/types";

const empty: Array<DocumentWithId<Material>> = [];

function useMaterialState(key: string, mode: "student" | "teacher", studentId = "") {
  const [state, setState] = useState({ data: empty, loading: true, error: null as string | null });
  useEffect(() => {
    if (!key) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ data: empty, loading: false, error: null });
      return;
    }
    const observer = {
      next: (data: Array<DocumentWithId<Material>>) => setState({ data, loading: false, error: null }),
      error: () => setState((current) => ({ ...current, loading: false, error: "Не удалось загрузить материалы." })),
    };
    return mode === "teacher"
      ? subscribeTeacherMaterials(getFirebaseDb(), key, observer)
      : subscribeStudentMaterials(getFirebaseDb(), studentId, key, observer);
  }, [key, mode, studentId]);
  return state;
}

export function useTeacherMaterials(teacherId: string) {
  return useMaterialState(teacherId, "teacher");
}

export function useStudentMaterials(programProfileId: string, studentId: string) {
  return useMaterialState(programProfileId, "student", studentId);
}

export function useMaterialFolders(teacherId: string) {
  const [state, setState] = useState({ data: [] as Array<DocumentWithId<MaterialFolder>>, loading: true, error: null as string | null });
  useEffect(() => subscribeMaterialFolders(getFirebaseDb(), teacherId, { next: (data) => setState({ data, loading: false, error: null }), error: () => setState((current) => ({ ...current, loading: false, error: "Не удалось загрузить папки." })) }), [teacherId]);
  return state;
}

export function useStudentMaterialFolders(studentId: string) {
  const [state, setState] = useState({ data: [] as Array<DocumentWithId<MaterialFolder>>, loading: true, error: null as string | null });
  useEffect(() => subscribeStudentMaterialFolders(getFirebaseDb(), studentId, { next: (data) => setState({ data, loading: false, error: null }), error: () => setState((current) => ({ ...current, loading: false, error: "Не удалось загрузить папки." })) }), [studentId]);
  return state;
}

export function useProgramProfiles() {
  const [state, setState] = useState({
    data: [] as Array<DocumentWithId<ProgramProfile>>,
    loading: true,
    error: null as string | null,
  });
  useEffect(() => subscribeProgramProfiles(getFirebaseDb(), {
    next: (data) => setState({ data, loading: false, error: null }),
    error: () => setState((current) => ({ ...current, loading: false, error: "Не удалось загрузить программы." })),
  }), []);
  return state;
}

export function useExamBlueprints() {
  const [state, setState] = useState({
    data: [] as Array<DocumentWithId<ExamBlueprint>>,
    loading: true,
    error: null as string | null,
  });
  useEffect(() => subscribeExamBlueprints(getFirebaseDb(), {
    next: (data) => setState({ data, loading: false, error: null }),
    error: () => setState((current) => ({ ...current, loading: false, error: "Не удалось загрузить структуру экзамена." })),
  }), []);
  return state;
}
