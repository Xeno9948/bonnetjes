export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";

const KIYOH_BASE = "https://www.kiyoh.com/v1/publication";
const KV_BASE = "https://www.klantenvertellen.nl/v1/publication";

// Server-side memory cache — 30 minute TTL
let cache: { data: any; ts: number } | null = null;
const CACHE_TTL = 30 * 60 * 1000;

async function fetchLocations(baseUrl: string, token: string, source: string) {
  const since = "2019-01-01T00:00:00.000+00:00";
  const url = `${baseUrl}/review/locations/latest?updatedSince=${encodeURIComponent(since)}&dateSince=${encodeURIComponent(since)}&limit=10000`;
  const res = await fetch(url, {
    headers: { "X-Publication-Api-Token": token },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${source} API error: ${res.status}`);
  const data = await res.json();
  return (Array.isArray(data) ? data : []).map((loc: any) => ({ ...loc, source }));
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as any).role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Serve from memory cache if fresh
  const now = Date.now();
  if (cache && now - cache.ts < CACHE_TTL) {
    return NextResponse.json({ ...cache.data, fromCache: true });
  }

  const tokenKIYOH = process.env.KIYOH_API_TOKEN;
  const tokenKV = process.env.KV_API_TOKEN;

  const results = await Promise.allSettled([
    tokenKIYOH ? fetchLocations(KIYOH_BASE, tokenKIYOH, "kiyoh") : Promise.resolve([]),
    tokenKV    ? fetchLocations(KV_BASE,    tokenKV,    "kv")    : Promise.resolve([]),
  ]);

  const kiyohLocations = results[0].status === "fulfilled" ? results[0].value : [];
  const kvLocations    = results[1].status === "fulfilled" ? results[1].value : [];
  const kiyohError     = results[0].status === "rejected"  ? (results[0].reason as Error).message : null;
  const kvError        = results[1].status === "rejected"  ? (results[1].reason as Error).message : null;

  const data = { kiyoh: kiyohLocations, kv: kvLocations, errors: { kiyoh: kiyohError, kv: kvError }, fromCache: false };
  cache = { data, ts: now };

  return NextResponse.json(data);
}
