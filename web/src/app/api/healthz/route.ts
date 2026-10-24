// Liveness: always 200 and fast. Touches no dependency, so a slow store never gets the pod killed.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
}
