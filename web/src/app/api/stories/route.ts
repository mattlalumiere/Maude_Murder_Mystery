import { hostIdFromSession } from "@/auth";
import { handle, json } from "@/lib/http";
import { listGallery, listLibrary, type GallerySort } from "@/lib/stories";
import { HttpError } from "@/lib/store";

/** ?scope=gallery (public, default) or ?scope=mine (signed in). */
export async function GET(req: Request) {
  return handle(async () => {
    const u = new URL(req.url);
    if (u.searchParams.get("scope") === "mine") {
      const hostId = await hostIdFromSession();
      if (!hostId) throw new HttpError(401, "Sign in to see your stories");
      return json({ stories: await listLibrary(hostId) });
    }
    const sort = (["top", "new", "played"] as const).includes(u.searchParams.get("sort") as GallerySort) ? (u.searchParams.get("sort") as GallerySort) : "top";
    return json({ stories: await listGallery({ sort, q: (u.searchParams.get("q") ?? "").slice(0, 60) }) });
  });
}
