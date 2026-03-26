export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";

const KIYOH_BASE = "https://www.kiyoh.com/v1/publication";
const KV_BASE = "https://www.klantenvertellen.nl/v1/publication";

const TENANT_ID: Record<string, string> = { kiyoh: "98", kv: "99" };

// Fetch all locations first, then get moderation queue for each
async function fetchAllLocations(baseUrl: string, token: string, source: string) {
  const since = "2019-01-01T00:00:00.000+00:00";
  const url = `${baseUrl}/review/locations/latest?updatedSince=${encodeURIComponent(since)}&dateSince=${encodeURIComponent(since)}&limit=10000`;
  const res = await fetch(url, {
    headers: { "X-Publication-Api-Token": token },
    next: { revalidate: 1800 }
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (Array.isArray(data) ? data : []).map((loc: any) => ({
    locationId: loc.locationId ?? loc.id,
    locationName: loc.locationName ?? loc.name,
    source
  }));
}

async function fetchModerationForLocation(
  baseUrl: string,
  token: string,
  locationId: string,
  tenantId: string,
  source: string
) {
  const url = `${baseUrl}/review/external/moderation?locationId=${locationId}&tenantId=${tenantId}&limit=250`;
  try {
    const res = await fetch(url, {
      headers: { "X-Publication-Api-Token": token },
      next: { revalidate: 60 }
    });
    if (!res.ok) return [];
    const data = await res.json();
    const reviews = Array.isArray(data) ? data : (data.reviews ?? data.content ?? []);
    return reviews.map((r: any) => ({ ...r, locationId, source }));
  } catch {
    return [];
  }
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || (session.user as any).role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tokenKIYOH = process.env.KIYOH_API_TOKEN;
    const tokenKV = process.env.KV_API_TOKEN;

    // 1. Load all locations from both platforms
    const [kiyohLocations, kvLocations] = await Promise.all([
      tokenKIYOH ? fetchAllLocations(KIYOH_BASE, tokenKIYOH, "kiyoh") : Promise.resolve([]),
      tokenKV ? fetchAllLocations(KV_BASE, tokenKV, "kv") : Promise.resolve([])
    ]);

    // 2. Fetch moderation queue for each location (limit concurrency to avoid rate limits)
    const BATCH = 10;
    const allReviews: any[] = [];

    const fetchBatch = async (locations: any[], baseUrl: string, token: string) => {
      for (let i = 0; i < locations.length; i += BATCH) {
        const batch = locations.slice(i, i + BATCH);
        const results = await Promise.all(
          batch.map((loc: any) =>
            fetchModerationForLocation(
              baseUrl,
              token,
              loc.locationId,
              TENANT_ID[loc.source] ?? "98",
              loc.source
            )
          )
        );
        results.forEach(r => allReviews.push(...r));
      }
    };

    await Promise.all([
      tokenKIYOH ? fetchBatch(kiyohLocations, KIYOH_BASE, tokenKIYOH) : Promise.resolve(),
      tokenKV ? fetchBatch(kvLocations, KV_BASE, tokenKV) : Promise.resolve()
    ]);

    // Create a locationId -> locationName map for enriching the reviews
    const locationMap: Record<string, string> = {};
    [...kiyohLocations, ...kvLocations].forEach((loc: any) => {
      locationMap[loc.locationId] = loc.locationName;
    });

    const enriched = allReviews.map((r: any) => ({
      ...r,
      locationName: locationMap[r.locationId] ?? r.locationId
    }));

    return NextResponse.json({
      reviews: enriched,
      total: enriched.length,
      locationCount: kiyohLocations.length + kvLocations.length
    });
  } catch (error) {
    console.error("Moderation queue error:", error);
    return NextResponse.json({ error: "Failed to fetch moderation queue" }, { status: 500 });
  }
}
