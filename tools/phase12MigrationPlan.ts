import {
  EGE_RUSSIAN_2027_PROJECT_ID,
  OGE_RUSSIAN_2026_PILOT_ID,
  OGE_RUSSIAN_2027_PROJECT_ID,
  examBlueprintSeeds,
  validateBlueprintTotals,
} from "../src/features/exams/blueprints.js";

const plan = {
  mode: "plan-only",
  productionWrites: false,
  blueprints: [
    OGE_RUSSIAN_2026_PILOT_ID,
    OGE_RUSSIAN_2027_PROJECT_ID,
    EGE_RUSSIAN_2027_PROJECT_ID,
  ].map((id) => ({
    id,
    valid: validateBlueprintTotals(examBlueprintSeeds[id] as never),
    sourceStatus: examBlueprintSeeds[id].sourceStatus,
    maximum: examBlueprintSeeds[id].primaryMaxScore,
  })),
  steps: [
    "Seed blueprints into the Firebase Emulator only",
    "Point stable program profiles to currentBlueprintId",
    "Keep historical mock and homework examBlueprintId unchanged",
    "Run unit, rules and Playwright acceptance suites",
    "Stop for manual acceptance before any production action",
  ],
};

process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
