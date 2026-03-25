import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";

export const dynamic = "force-dynamic";

const KIYOH_BASE = "https://www.kiyoh.com/v1/publication";
const KV_BASE = "https://www.klantenvertellen.nl/v1/publication";

async function fetchLocations(baseUrl: string, token: string, source: string) {
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const url = `${baseUrl}/review/locations/latest?updatedSince=${since}`;
  const res = await fetch(url, {
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

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as any).role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const kiyohToken = process.env.KIYOH_API_TOKEN;
  const kvToken = process.env.KV_API_TOKEN;

  const results = await Promise.allSettled([
    kiyohToken ? fetchLocations(KIYOH_BASE, kiyohToken, "kiyoh") : Promise.resolve([]),
    kvToken ? fetchLocations(KV_BASE, kvToken, "kv") : Promise.resolve([])
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
