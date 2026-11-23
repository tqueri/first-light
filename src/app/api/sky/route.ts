import { getSkyPayload } from "@/lib/data";

export async function GET() {
  const payload = await getSkyPayload();
  return Response.json(payload, {
    headers: { "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400" },
  });
}
