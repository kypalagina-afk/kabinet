import {
  collection,
  getDocs,
  query,
  where,
  type Firestore,
} from "firebase/firestore";
import type { LessonSeries } from "../types.js";
import {
  materializeRollingLessonSeries,
  type MaterializeLessonSeriesResult,
} from "./materializeLessonSeries.js";

export interface ScheduledMaterializationReport {
  startedAt: string;
  finishedAt: string;
  series: Array<{
    seriesId: string;
    created: number;
    skipped: number;
    suppressed: number;
  }>;
}

export interface ScheduledLessonMaterializer {
  run(now?: Date): Promise<ScheduledMaterializationReport>;
}

/**
 * Backend-safe domain foundation. The caller is expected to be a protected,
 * scheduled Admin SDK process; no production scheduler is deployed in Phase 10.2.
 */
export class FirestoreScheduledLessonMaterializer
  implements ScheduledLessonMaterializer
{
  constructor(private readonly db: Firestore) {}

  async run(now = new Date()): Promise<ScheduledMaterializationReport> {
    const startedAt = new Date().toISOString();
    const snapshot = await getDocs(query(
      collection(this.db, "lessonSeries"),
      where("active", "==", true),
    ));
    const rows: ScheduledMaterializationReport["series"] = [];
    for (const item of snapshot.docs) {
      const result: MaterializeLessonSeriesResult =
        await materializeRollingLessonSeries(
          this.db,
          item.id,
          item.data() as LessonSeries,
          now,
        );
      rows.push({
        seriesId: item.id,
        created: result.createdIds.length,
        skipped: result.skippedIds.length,
        suppressed: result.suppressedIds.length,
      });
    }
    return {
      startedAt,
      finishedAt: new Date().toISOString(),
      series: rows,
    };
  }
}
