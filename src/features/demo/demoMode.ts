import type { UserProfile } from "../../lib/firebase/types";

export function isDemoProfile(
  profile: Pick<UserProfile, "accountMode"> | null | undefined,
): boolean {
  return profile?.accountMode === "demo";
}

export const DEMO_MUTATION_NOTICE =
  "Демо-режим: создание аккаунтов и загрузка файлов отключены. Остальные изменения сохраняются только внутри демонстрационного кабинета.";
