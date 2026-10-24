import { addPlayer, createRoom, startGame } from "../../../../src/lib/engine";
import type { AgeGroup, Room } from "../../../../src/lib/types";

export type Roster = [string, AgeGroup][];

export const DEFAULT_ROSTER: Roster = [
  ...Array.from({ length: 10 }, (_, i) => [`Adult${i}`, "adult"] as [string, AgeGroup]),
  ["Maya", "kid"], ["Ollie", "kid"], ["Zane", "teen"], ["Tilly", "teen"], ["Pip", "little"], ["Jo", "little"],
];

export function rosterOf(adults: number, kids = 0, teens = 0, littles = 0): Roster {
  return [
    ...Array.from({ length: adults }, (_, i) => [`A${i}`, "adult"] as [string, AgeGroup]),
    ...Array.from({ length: kids }, (_, i) => [`K${i}`, "kid"] as [string, AgeGroup]),
    ...Array.from({ length: teens }, (_, i) => [`T${i}`, "teen"] as [string, AgeGroup]),
    ...Array.from({ length: littles }, (_, i) => [`L${i}`, "little"] as [string, AgeGroup]),
  ];
}

export async function lobbyRoom(roster: Roster = DEFAULT_ROSTER, code = "swordfish"): Promise<Room> {
  const room = await createRoom("host1", code);
  roster.forEach(([n, g]) => addPlayer(room, n, g, false));
  return room;
}

export async function startedRoom(roster: Roster = DEFAULT_ROSTER, code = "swordfish"): Promise<Room> {
  const room = await lobbyRoom(roster, code);
  await startGame(room);
  return room;
}
