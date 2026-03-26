export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";

const KIYOH_BASE = "https://www.kiyoh.com/v1/publication";
const KV_BASE = "https://www.klantenvertellen.nl/v1/publication";

const TENANT_ID: Record<string, string> = { kiyoh: "98", kv: "99" };

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Fetch all locations - returns them with numberReviewsPending so we can filter
async function fetchAllLocations(baseUrl: string, token: string, source: string) {
  const since = "2019-01-01T00:00:00.000+00:00";
  const url = `${baseUrl}/review/locations/latest?updatedSince=${encodeURIComponent(since)}&dateSince=${encodeURIComponent(since)}&limit=10000`;
  const res = await fetch(url, {
    headers: { "X-Publication-Api-Token": token },
    next: { revalidate: 1800 } // Cache 30 min
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (Array.isArray(data) ? data : []).map((loc: any) => ({
    locationId: loc.locationId ?? loc.id,
    locationName: loc.locationName ?? loc.name,
    numberReviewsPending: loc.numberReviewsPending ?? 0,
    source
  }));
}

// Fetch reviews for a single location - look for non-published ones
async function fetchPendingReviewsForLocation(
  baseUrl: string,
  token: string,
  locationId: string,
  tenantId: string,
  source: string,
  locationName: string
) {
  const url = `${baseUrl}/review/external?locationId=${locationId}&tenantId=${tenantId}&orderBy=CREATE_DATE&sortOrder=DESC&limit=50`;
  try {
    const res = await fetch(url, {
      headers: { "X-Publication-Api-Token": token },
      cache: "no-store"
    });
    if (!res.ok) {
      if (res.status === 429) {
        // Rate limited - wait and retry once
        await sleep(2000);
        const retry = await fetch(url, {
          headers: { "X-Publication-Api-Token": token },
          cache: "no-store"
        });
        if (!retry.ok) return [];
        const d = await retry.json();
        const reviews = Array.isArray(d) ? d : (d.reviews ?? d.content ?? []);
        return reviews
          .filter((r: any) => r.status && r.status !== "PUBLISHED" && r.status !== "VERIFIED")
          .map((r: any) => ({ ...r, locationId, locationName, source }));
      }
      return [];
    }
    const data = await res.json();
    const reviews = Array.isArray(data) ? data : (data.reviews ?? data.content ?? []);
    // Filter to non-published / pending only
    return reviews
      .filter((r: any) => r.status && r.status !== "PUBLISHED" && r.status !== "VERIFIED")
      .map((r: any) => ({ ...r, locationId, locationName, source }));
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

    // 1. Load all locations from both platforms in parallel (this is 2 calls, fine)
    const [kiyohLocations, kvLocations] = await Promise.all([
      tokenKIYOH ? fetchAllLocations(KIYOH_BASE, tokenKIYOH, "kiyoh") : [],
      tokenKV ? fetchAllLocations(KV_BASE, tokenKV, "kv") : []
    ]);

    const allLocations = [...kiyohLocations, ...kvLocations];
    const locationCount = allLocations.length;

    // 2. Only fetch reviews from locations that actually have pending reviews
    // This dramatically reduces API calls (from 250 to maybe 5-10)
    const locationsWithPending = allLocations.filter(
      loc => (loc.numberReviewsPending ?? 0) > 0
    );

    // 3. Fetch sequentially with small delay to avoid rate limiting
    const pendingReviews: any[] = [];
    for (const loc of locationsWithPending) {
      const baseUrl = loc.source === "kv" ? KV_BASE : KIYOH_BASE;
      const token = loc.source === "kv" ? tokenKV : tokenKIYOH;
      if (!token) continue;

      const reviews = await fetchPendingReviewsForLocation(
        baseUrl,
        token,
        loc.locationId,
        TENANT_ID[loc.source] ?? "98",
        loc.source,
        loc.locationName
      );
      pendingReviews.push(...reviews);

      // Polite delay between calls — 300ms — avoids Cloudflare rate limiting
      if (locationsWithPending.indexOf(loc) < locationsWithPending.length - 1) {
        await sleep(300);
      }
    }

    return NextResponse.json({
      reviews: pendingReviews,
      total: pendingReviews.length,
      locationCount,
      locationsWithPending: locationsWithPending.length
    });
  } catch (error) {
    console.error("Moderation queue error:", error);
    return NextResponse.json({ error: "Failed to fetch moderation queue" }, { status: 500 });
  }
}
