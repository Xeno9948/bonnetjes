export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";

const KIYOH_BASE = "https://www.kiyoh.com/v1/publication";
const KV_BASE = "https://www.klantenvertellen.nl/v1/publication";

// Global in-memory cache to prevent 429 rate limiting
let globalLocationsCache: {
  data: any;
  timestamp: number;
} | null = null;

const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Fetch all locations with pagination to avoid 429 and limit issues
async function fetchAllLocations(baseUrl: string, token: string, source: string) {
  const since = "2019-01-01T00:00:00.000+00:00";
  const limit = 250; // Use reasonable limit
  let offset = 0;
  let allProcessed: any[] = [];
  let hasMore = true;

  try {
    while (hasMore) {
      const url = `${baseUrl}/review/locations/latest?updatedSince=${encodeURIComponent(since)}&dateSince=${encodeURIComponent(since)}&limit=${limit}&offset=${offset}`;
      console.log(`[${source}] Fetching locations (offset ${offset})...`);
      
      const res = await fetch(url, {
        headers: { "X-Publication-Api-Token": token },
        cache: "no-store" 
      });

      if (!res.ok) {
        if (res.status === 429) {
          console.warn(`[${source}] Rate limited (429). Waiting 5s...`);
          await sleep(5000); // Wait longer on 429
          continue; // Retry same offset
        }
        console.error(`[${source}] Locations API error ${res.status} at offset ${offset}`);
        break;
      }

      const data = await res.json();
      const locationsPage = Array.isArray(data) ? data : (data.locations ?? data.content ?? []);
      
      if (locationsPage.length === 0) {
        hasMore = false;
        break;
      }

      const mapped = locationsPage.map((loc: any) => ({
        ...loc,
        source
      }));

      allProcessed.push(...mapped);
      
      if (locationsPage.length < limit) {
        hasMore = false;
      } else {
        offset += limit;
        await sleep(500); // 500ms delay between pages
      }
    }
    
    console.log(`[${source}] Total ${allProcessed.length} locations fetched`);
    return allProcessed;
  } catch (err) {
    console.error(`[${source}] Failed to fetch locations:`, err);
    return allProcessed;
  }
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || (session.user as any).role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check memory cache
    const now = Date.now();
    if (globalLocationsCache && (now - globalLocationsCache.timestamp < CACHE_TTL)) {
      console.log("Serving locations from memory cache");
      return NextResponse.json(globalLocationsCache.data);
    }

    const tokenKIYOH = process.env.KIYOH_API_TOKEN;
    const tokenKV = process.env.KV_API_TOKEN;

    const results = await Promise.allSettled([
      tokenKIYOH ? fetchAllLocations(KIYOH_BASE, tokenKIYOH, "kiyoh") : Promise.resolve([]),
      tokenKV ? fetchAllLocations(KV_BASE, tokenKV, "kv") : Promise.resolve([])
    ]);

    const kiyohLocations = results[0].status === "fulfilled" ? results[0].value : [];
    const kvLocations = results[1].status === "fulfilled" ? results[1].value : [];
    const kiyohError = results[0].status === "rejected" ? (results[0].reason as Error).message : null;
    const kvError = results[1].status === "rejected" ? (results[1].reason as Error).message : null;

    const responseData = {
      kiyoh: kiyohLocations,
      kv: kvLocations,
      errors: { kiyoh: kiyohError, kv: kvError },
      timestamp: now
    };

    // Update global cache
    globalLocationsCache = {
      data: responseData,
      timestamp: now
    };

    return NextResponse.json(responseData);
  } catch (error) {
    console.error("Locations fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch locations" }, { status: 500 });
  }
}
