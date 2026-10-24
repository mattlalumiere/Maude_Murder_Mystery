import type { AgeGroup } from "../../../src/lib/types";

/** 16 players: 10 adults, 3 kids, 1 teen, 2 littles (matches the capacity model's 16). */
export const ROSTER16: { name: string; ageGroup: AgeGroup }[] = [
  ...Array.from({ length: 10 }, (_, i) => ({ name: `Ad${i}`, ageGroup: "adult" as AgeGroup })),
  { name: "Kid0", ageGroup: "kid" }, { name: "Kid1", ageGroup: "kid" }, { name: "Kid2", ageGroup: "kid" },
  { name: "Teen0", ageGroup: "teen" }, { name: "Tot0", ageGroup: "little" }, { name: "Tot1", ageGroup: "little" },
];
