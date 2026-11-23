import type { NextRequest } from "next/server";
import { getCellDetail } from "@/lib/data";

export async function GET(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "bad id" }, { status: 400 });
  const detail = await getCellDetail(id);
  if (!detail) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(detail, { headers: { "cache-control": "public, s-maxage=3600" } });
}
