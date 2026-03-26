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

// Global in-memory cache to prevent 429 rate limiting on refresh
// Caches the aggregated reviews for 5 minutes
let globalModerationCache: {
  data: any;
  timestamp: number;
} | null = null;

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Fetch all locations - uses pagination since the API caps single requests at 250
async function fetchAllLocations(baseUrl: string, token: string, source: string) {
  const since = "2019-01-01T00:00:00.000+00:00";
  const limit = 250; // Use the known API cap
  let offset = 0;
  let allProcessed: any[] = [];
  let hasMore = true;

  try {
    while (hasMore) {
      const url = `${baseUrl}/review/locations/latest?updatedSince=${encodeURIComponent(since)}&dateSince=${encodeURIComponent(since)}&limit=${limit}&offset=${offset}`;
      console.log(`Fetching locations for ${source} (offset ${offset})...`);
      
      const res = await fetch(url, {
        headers: { "X-Publication-Api-Token": token },
        cache: "no-store" 
      });

      if (!res.ok) {
        console.error(`Locations API error ${res.status} for ${source} at offset ${offset}`);
        break;
      }

      const data = await res.json();
      const locationsPage = Array.isArray(data) ? data : [];
      
      if (locationsPage.length === 0) {
        hasMore = false;
        break;
      }

      const mapped = locationsPage.map((loc: any) => ({
        locationId: loc.locationId ?? loc.id,
        locationName: loc.locationName ?? loc.name,
        numberReviewsPending: loc.numberReviewsPending ?? 0,
        source
      }));

      allProcessed.push(...mapped);
      
      // If we got fewer than the limit, we're likely done
      if (locationsPage.length < limit) {
        hasMore = false;
      } else {
        offset += limit;
        // Small delay to avoid triggering Cloudflare during pagination
        await sleep(100);
      }
    }
    
    console.log(`Total ${allProcessed.length} locations fetched for ${source}`);
    return allProcessed;
  } catch (err) {
    console.error(`Failed to fetch locations for ${source}:`, err);
    return allProcessed;
  }
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
  // Use SortOrder=DESC and a large limit to catch all recent ones
  const url = `${baseUrl}/review/external?locationId=${locationId}&tenantId=${tenantId}&orderBy=CREATE_DATE&sortOrder=DESC&limit=100`;
  
  try {
    const res = await fetch(url, {
      headers: { "X-Publication-Api-Token": token },
      cache: "no-store"
    });
    
    if (!res.ok) {
      if (res.status === 429) {
        console.warn(`Rate limited (429) for location ${locationId}. Retrying after sleep...`);
        await sleep(2000);
        const retry = await fetch(url, {
          headers: { "X-Publication-Api-Token": token },
          cache: "no-store"
        });
        if (!retry.ok) return [];
        const d = await retry.json();
        return extractPending(d, locationId, locationName, source);
      }
      return [];
    }
    
    const data = await res.json();
    return extractPending(data, locationId, locationName, source);
  } catch (err) {
    console.error(`Error fetching reviews for location ${locationId}:`, err);
    return [];
  }
}

function extractPending(data: any, locationId: string, locationName: string, source: string) {
  const reviews = Array.isArray(data) ? data : (data.reviews ?? data.content ?? data.feedbacks ?? []);
  
  return reviews
    .filter((r: any) => {
      const status = (r.status || r.statusCode || "").toUpperCase();
      // If no status, it might be published or pending. But usually published is default.
      // We want everything NOT published and NOT verified.
      return status !== "PUBLISHED" && status !== "VERIFIED" && status !== "";
    })
    .map((r: any) => ({
      ...r,
      locationId,
      locationName,
      source,
      // Ensure we have a consistent ID field for the UI
      id: r.reviewId ?? r.id ?? r.feedbackId
    }));
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || (session.user as any).role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check memory cache first
    const now = Date.now();
    if (globalModerationCache && (now - globalModerationCache.timestamp < CACHE_TTL)) {
      console.log("Serving moderation queue from memory cache");
      return NextResponse.json(globalModerationCache.data);
    }

    const tokenKIYOH = process.env.KIYOH_API_TOKEN;
    const tokenKV = process.env.KV_API_TOKEN;

    // 1. Load all locations
    const [kiyohLocations, kvLocations] = await Promise.all([
      tokenKIYOH ? fetchAllLocations(KIYOH_BASE, tokenKIYOH, "kiyoh") : [],
      tokenKV ? fetchAllLocations(KV_BASE, tokenKV, "kv") : []
    ]);

    const allLocations = [...kiyohLocations, ...kvLocations];
    const totalLocations = allLocations.length;

    // 2. Identify locations with pending reviews
    const locationsWithPending = allLocations.filter(
      loc => (loc.numberReviewsPending ?? 0) > 0
    );

    console.log(`Checking ${locationsWithPending.length} locations out of ${totalLocations} for pending reviews...`);

    // 3. Fetch sequentially with a safe delay (500ms)
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

      // Avoid Cloudflare 1015 ban via sequential delay
      if (locationsWithPending.indexOf(loc) < locationsWithPending.length - 1) {
        await sleep(500); 
      }
    }

    const responseData = {
      reviews: pendingReviews,
      total: pendingReviews.length,
      locationCount: totalLocations,
      locationsChecked: locationsWithPending.length,
      timestamp: now
    };

    // Update global cache
    globalModerationCache = {
      data: responseData,
      timestamp: now
    };

    return NextResponse.json(responseData);
  } catch (error) {
    console.error("Moderation queue error:", error);
    return NextResponse.json({ error: "Failed to fetch moderation queue" }, { status: 500 });
  }
}
