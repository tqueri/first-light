import type { NextRequest } from "next/server";
import { getExoSpectra } from "@/lib/data-exo";

// GET /worlds/spectra?planet=WASP-39%20b → every JWST spectrum of that planet (with data points).
export async function GET(request: NextRequest) {
  const planet = request.nextUrl.searchParams.get("planet")?.trim();
  if (!planet || planet.length > 80) {
    return Response.json({ error: "missing or invalid ?planet=" }, { status: 400 });
  }
  const spectra = await getExoSpectra(planet);
  if (!spectra.length) return Response.json({ error: "no JWST spectra for this planet" }, { status: 404 });
  return Response.json(spectra, {
    headers: { "cache-control": "public, s-maxage=86400, stale-while-revalidate=604800" },
  });
}
