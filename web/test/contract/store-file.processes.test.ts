// File adapter only: several OS processes hammer one game; every successful put must be a distinct version.
import { execFile } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";
import { FileStore } from "../../src/lib/storage/store-file";
import { makeRoom } from "./harness";

const run = promisify(execFile);

it("file store: 4 processes x 25 wins each end at exactly version 101, with no torn or stray files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mm-proc-"));
  try {
    const store = new FileStore({ dir, cellId: "cell-x" });
    const room = makeRoom();
    await store.put(room, null);
    const tsx = join(process.cwd(), "node_modules", ".bin", "tsx");
    const child = join(process.cwd(), "test", "contract", "fixtures", "file-writer.ts");
    await Promise.all(Array.from({ length: 4 }, () => run(tsx, [child, dir, room.code, "25"], { timeout: 60_000 })));
    expect((await store.get(room.code))!.version).toBe(101);
    const gameDir = join(dir, "cell-x", "games", (room as unknown as { gameId: string }).gameId);
    expect(await readdir(gameDir)).toEqual(["room.json"]); // no leftover temp files
    expect(await readdir(join(dir, "cell-x", "locks"))).toEqual([]); // all locks released
  } finally { await rm(dir, { recursive: true, force: true }); }
}, 90_000);
