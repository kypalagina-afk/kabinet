import { doc, runTransaction, serverTimestamp, type Firestore } from "firebase/firestore";
import { baseAchievementDefinitions } from "../../../features/gamification/gamification.js";

function definitionFor(code: string) {
  const base = baseAchievementDefinitions.find((definition) => definition.code === code);
  if (base) return base;
  const dynamic = /^task-master-(\d+)$/.exec(code);
  if (!dynamic) throw new Error(`Unknown achievement code: ${code}`);
  return {
    code,
    title: `Мастер №${dynamic[1]}`,
    description: `Освоить экзаменационное задание №${dynamic[1]}`,
    iconKey: "target",
  };
}

export async function syncStudentAchievements(
  db: Firestore,
  input: {
    teacherId: string;
    studentId: string;
    studentProgramId: string;
    achievementCodes: string[];
  },
): Promise<{ created: string[] }> {
  const definitions = [...new Set(input.achievementCodes)].sort().map(definitionFor);
  if (!definitions.length) return { created: [] };
  const achievementReferences = definitions.map(({ code }) =>
    doc(db, "studentAchievements", `${input.studentProgramId}__${code}`),
  );
  const definitionReferences = definitions.map(({ code }) => doc(db, "achievementDefinitions", code));
  return runTransaction(db, async (transaction) => {
    const [achievementSnapshots, definitionSnapshots] = await Promise.all([
      Promise.all(achievementReferences.map((reference) => transaction.get(reference))),
      Promise.all(definitionReferences.map((reference) => transaction.get(reference))),
    ]);
    const created: string[] = [];
    definitions.forEach((definition, index) => {
      if (!definitionSnapshots[index]?.exists()) {
        transaction.set(definitionReferences[index]!, {
          ...definition,
          xpReward: 0,
          active: true,
          conditionConfig: {},
          schemaVersion: 1,
        });
      }
      if (!achievementSnapshots[index]?.exists()) {
        transaction.set(achievementReferences[index]!, {
          teacherId: input.teacherId,
          studentId: input.studentId,
          studentProgramId: input.studentProgramId,
          achievementDefinitionId: definition.code,
          earnedAt: serverTimestamp(),
          metadata: { sourceType: "derived-v1" },
          schemaVersion: 1,
        });
        created.push(definition.code);
      }
    });
    return { created };
  });
}
