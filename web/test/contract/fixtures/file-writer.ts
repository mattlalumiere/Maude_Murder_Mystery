// Child process for the cross process test: increments a counter via optimistic put, N successes.
import { FileStore } from "../../../src/lib/storage/store-file";

async function main() {
  const [dir, code, wins] = process.argv.slice(2);
  const store = new FileStore({ dir, cellId: "cell-x" });
  let won = 0;
  while (won < Number(wins)) {
    const r = await store.get(code);
    if (!r) throw new Error("missing");
    if (await store.put({ ...r, version: r.version + 1 }, r.version)) won++;
  }
  console.log(`done ${won}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
