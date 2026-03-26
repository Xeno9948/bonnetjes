export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";

const KIYOH_BASE = "https://www.kiyoh.com/v1/publication";
const KV_BASE = "https://www.klantenvertellen.nl/v1/publication";

const TENANT_ID: Record<string, string> = { kiyoh: "98", kv: "99" };

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Global in-memory cache to prevent 429 rate limiting on refresh
let globalModerationCache: {
  data: any;
  timestamp: number;
} | null = null;

const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// Fetch all locations with full pagination and 429 safety
async function fetchAllLocations(baseUrl: string, token: string, source: string) {
  const since = "2019-01-01T00:00:00.000+00:00";
  const limit = 250;
  let offset = 0;
  let allProcessed: any[] = [];
  let hasMore = true;

  while (hasMore) {
    const url = `${baseUrl}/review/locations/latest?updatedSince=${encodeURIComponent(since)}&dateSince=${encodeURIComponent(since)}&limit=${limit}&offset=${offset}`;
    console.log(`[${source}] Fetching locations for moderation (offset ${offset})...`);

    try {
      const res = await fetch(url, {
        headers: { "X-Publication-Api-Token": token },
        cache: "no-store"
      });

      if (!res.ok) {
        if (res.status === 429) {
          console.warn(`[${source}] Locations Rate limited (429). Waiting 5s...`);
          await sleep(5000);
          continue; // Retry
        }
        console.error(`[${source}] Locations API error ${res.status} at offset ${offset}`);
        break;
      }

      const data = await res.json();
      const page = Array.isArray(data) ? data : (data.locations ?? data.content ?? []);

      if (page.length === 0) {
        hasMore = false;
        break;
      }

      const mapped = page.map((loc: any) => ({
        locationId: loc.locationId ?? loc.id ?? loc.hashCode,
        locationName: loc.locationName ?? loc.name ?? loc.companyName ?? loc.locationId,
        numberReviewsPending: loc.numberReviewsPending ?? loc.pendingReviews ?? 0,
        numberReviews: loc.numberReviews ?? 0,
        source
      }));

      allProcessed.push(...mapped);

      if (page.length < limit) {
        hasMore = false;
      } else {
        offset += limit;
        await sleep(500); // 500ms delay between pages
      }
    } catch (err) {
      console.error(`[${source}] Error fetching locations at offset ${offset}:`, err);
      break;
    }
  }

  console.log(`[${source}] Total ${allProcessed.length} locations found for moderation scan`);
  return allProcessed;
}

// Fetch pending reviews for a location using the dedicated pending endpoint
async function fetchPendingReviewsForLocation(
  baseUrl: string,
  token: string,
  locationId: string,
  tenantId: string,
  source: string,
  locationName: string
) {
  const url = `${baseUrl}/review/external?locationId=${locationId}&tenantId=${tenantId}&orderBy=CREATE_DATE&sortOrder=DESC&limit=100`;

  try {
    const res = await fetch(url, {
      headers: { "X-Publication-Api-Token": token },
      cache: "no-store"
    });

    if (res.status === 429) {
      console.warn(`[${source}] Review Rate limited (429) for location ${locationId}. Waiting 3s...`);
      await sleep(3000);
      const retry = await fetch(url, {
        headers: { "X-Publication-Api-Token": token },
        cache: "no-store"
      });
      if (!retry.ok) return [];
      const d = await retry.json();
      return extractPending(d, locationId, locationName, source);
    }

    if (!res.ok) {
      console.warn(`[${source}] API ${res.status} for location ${locationId}`);
      return [];
    }

    const data = await res.json();
    return extractPending(data, locationId, locationName, source);
  } catch (err) {
    console.error(`[${source}] Error fetching reviews for location ${locationId}:`, err);
    return [];
  }
}

function extractReviewId(r: any): string {
  return r.reviewId ?? r.id ?? r.feedbackId ?? r.hashCode ?? r.externalId ?? r.uuid ?? "";
}

function extractContent(r: any): string {
  const direct = r.review ?? r.content ?? r.comment ?? r.opinion ?? r.text ?? r.description ?? "";
  if (direct) return direct;

  if (Array.isArray(r.reviewContent)) {
    const opinion = r.reviewContent.find(
      (c: any) => c.questionGroup === "DEFAULT_OPINION" || c.questionGroup === "OPINION" || c.questionGroup === "CONTENT"
    );
    if (opinion?.review) return opinion.review;
    const anyWithText = r.reviewContent.find((c: any) => c.review || c.content || c.text);
    if (anyWithText) return anyWithText.review ?? anyWithText.content ?? anyWithText.text ?? "";
  }
  return "";
}

function extractPending(data: any, locationId: string, locationName: string, source: string) {
  const reviews = Array.isArray(data)
    ? data
    : (data.reviews ?? data.content ?? data.feedbacks ?? data.items ?? []);

  return reviews
    .filter((r: any) => {
      const status = (r.status ?? r.statusCode ?? r.reviewStatus ?? "").toUpperCase();
      // Only include reviews that are potentially pending/in review
      return (
        status === "" ||
        status === "PENDING" ||
        status === "AWAITING_MODERATION" ||
        status === "IN_MODERATION" ||
        status === "NEW" ||
        status === "CONCEPT" ||
        status === "DRAFT" ||
        (status !== "PUBLISHED" && status !== "VERIFIED" && status !== "APPROVED" && status !== "REJECTED" && status !== "DELETED")
      );
    })
    .map((r: any) => ({
      ...r,
      locationId,
      locationName,
      source,
      _id: extractReviewId(r),
      _content: extractContent(r),
    }));
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || (session.user as any).role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const forceRefresh = searchParams.get("force") === "1";
    const loadAll = searchParams.get("all") === "1"; 

    // Check memory cache
    const now = Date.now();
    if (!forceRefresh && globalModerationCache && (now - globalModerationCache.timestamp < CACHE_TTL)) {
      console.log("Serving moderation queue from memory cache");
      return NextResponse.json({ ...globalModerationCache.data, fromCache: true });
    }

    const tokenKIYOH = process.env.KIYOH_API_TOKEN;
    const tokenKV = process.env.KV_API_TOKEN;

    if (!tokenKIYOH && !tokenKV) {
      return NextResponse.json({ error: "API tokens missing" }, { status: 500 });
    }

    // 1. Load all locations
    const [kiyohLocations, kvLocations] = await Promise.all([
      tokenKIYOH ? fetchAllLocations(KIYOH_BASE, tokenKIYOH, "kiyoh") : [],
      tokenKV ? fetchAllLocations(KV_BASE, tokenKV, "kv") : []
    ]);

    const allLocations = [...kiyohLocations, ...kvLocations];
    const totalLocations = allLocations.length;

    // 2. Identify locations to check
    const locationsToCheck = loadAll
      ? allLocations
      : allLocations.filter(loc => (loc.numberReviewsPending ?? 0) > 0);

    console.log(`Checking ${locationsToCheck.length} of ${totalLocations} locations for pending reviews...`);

    // 3. Fetch sequentially with a safe delay (1500ms between locations)
    const pendingReviews: any[] = [];
    for (let i = 0; i < locationsToCheck.length; i++) {
      const loc = locationsToCheck[i];
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

      if (i < locationsToCheck.length - 1) {
        await sleep(1500); // 1.5s sequential delay
      }
    }

    const responseData = {
      reviews: pendingReviews,
      total: pendingReviews.length,
      locationCount: totalLocations,
      locationsChecked: locationsToCheck.length,
      loadedAll: loadAll,
      timestamp: now,
      fromCache: false
    };

    if (!loadAll) {
      globalModerationCache = { data: responseData, timestamp: now };
    }

    return NextResponse.json(responseData);
  } catch (error) {
    console.error("Moderation queue error:", error);
    return NextResponse.json({ error: "Failed to fetch moderation queue" }, { status: 500 });
  }
}
