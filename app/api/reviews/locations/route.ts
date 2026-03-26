import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";

export const dynamic = "force-dynamic";

const KIYOH_BASE = "https://www.kiyoh.com/v1/publication";
const KV_BASE = "https://www.klantenvertellen.nl/v1/publication";

async function fetchLocations(baseUrl: string, token: string, source: string, limit: string) {
  // All three params are mandatory per API docs
  const since = "2020-01-01T00:00:00.000+00:00";
  const url = `${baseUrl}/review/locations/latest?updatedSince=${encodeURIComponent(since)}&dateSince=${encodeURIComponent(since)}&limit=${limit}`;
  const res = await fetch(url.toString(), {
    headers: { "X-Publication-Api-Token": token },
    next: { revalidate: 60 }
  });
  if (!res.ok) throw new Error(`${source} API error: ${res.status}`);
  const data = await res.json();
  return (Array.isArray(data) ? data : []).map((loc: any) => ({
    ...loc,
    source
  }));
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = searchParams.get("limit") || "500";

  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as any).role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const kiyohToken = process.env.CLOUDFLARE_ACCESS_KEY_ID || process.env.KIYOH_API_TOKEN;
  const kvToken = process.env.CLOUDFLARE_SECRET_ACCESS_KEY || process.env.KV_API_TOKEN;

  // Wait! The user just renamed the R2 variables to CLOUDFLARE_...
  // But KIYOH_API_TOKEN and KV_API_TOKEN are separate.
  // In the user's list from Step 1646, they had KIYOH_API_TOKEN and KV_API_TOKEN.
  // I should keep using those.
  
  const tokenKIYOH = process.env.KIYOH_API_TOKEN;
  const tokenKV = process.env.KV_API_TOKEN;

  const results = await Promise.allSettled([
    tokenKIYOH ? fetchLocations(KIYOH_BASE, tokenKIYOH, "kiyoh", limit) : Promise.resolve([]),
    tokenKV ? fetchLocations(KV_BASE, tokenKV, "kv", limit) : Promise.resolve([])
  ]);

  const kiyohLocations = results[0].status === "fulfilled" ? results[0].value : [];
  const kvLocations = results[1].status === "fulfilled" ? results[1].value : [];
  const kiyohError = results[0].status === "rejected" ? (results[0].reason as Error).message : null;
  const kvError = results[1].status === "rejected" ? (results[1].reason as Error).message : null;

  return NextResponse.json({
    kiyoh: kiyohLocations,
    kv: kvLocations,
    errors: { kiyoh: kiyohError, kv: kvError }
  });
}
