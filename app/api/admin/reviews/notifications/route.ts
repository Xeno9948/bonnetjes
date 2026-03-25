import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";

export const dynamic = "force-dynamic";

const KIYOH_BASE = "https://www.kiyoh.com/v1/publication";
const KV_BASE = "https://www.klantenvertellen.nl/v1/publication";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as any).role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const kiyohToken = process.env.KIYOH_API_TOKEN;
  const kvToken = process.env.KV_API_TOKEN;

  if (!kiyohToken && !kvToken) {
    return NextResponse.json({ count: 0 });
  }

  try {
    // 1. Fetch all locations from both platforms
    const fetchLocations = async (baseUrl: string, token: string) => {
      const url = new URL(`${baseUrl}/review/locations/latest`);
      url.searchParams.set("limit", "100");
      // Use a fixed date (24h ago) to check for updates
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      url.searchParams.set("updatedSince", yesterday);

      const res = await fetch(url.toString(), {
        headers: { "X-Publication-Api-Token": token }
      });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : (data.locations ?? []);
    };

    const [kiyohLocs, kvLocs] = await Promise.all([
      kiyohToken ? fetchLocations(KIYOH_BASE, kiyohToken) : Promise.resolve([]),
      kvToken ? fetchLocations(KV_BASE, kvToken) : Promise.resolve([])
    ]);

    // The 'locations/latest' endpoint with 'updatedSince' returns locations that have new activity.
    // Each location object might have a 'numberReviews' which we could compare, but 
    // the simplest indicator is just the number of locations returned.
    const uniqueLocationsWithUpdates = new Set([
      ...kiyohLocs.map((l: any) => l.locationId),
      ...kvLocs.map((l: any) => l.locationId)
    ]);

    return NextResponse.json({ 
      count: uniqueLocationsWithUpdates.size,
      updatedLocations: [...kiyohLocs, ...kvLocs]
    });
  } catch (error) {
    console.error("Review notifications error:", error);
    return NextResponse.json({ count: 0 });
  }
}
