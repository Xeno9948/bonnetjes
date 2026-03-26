export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";

const KIYOH_BASE = "https://www.kiyoh.com/v1/publication";
const KV_BASE    = "https://www.klantenvertellen.nl/v1/publication";

// Server-side memory cache — 10 minute TTL
let cache: { data: any; ts: number } | null = null;
const CACHE_TTL = 10 * 60 * 1000;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function extractId(r: any): string {
  return r.reviewId ?? r.id ?? r.feedbackId ?? r.hashCode ?? r.externalId ?? r.uuid ?? "";
}

function extractContent(r: any): string {
  const direct = r.review ?? r.content ?? r.comment ?? r.opinion ?? r.text ?? "";
  if (direct) return direct;
  if (Array.isArray(r.reviewContent)) {
    const hit = r.reviewContent.find(
      (c: any) => c.questionGroup === "DEFAULT_OPINION" || c.questionGroup === "OPINION"
    ) ?? r.reviewContent.find((c: any) => c.review || c.content || c.text);
    return hit?.review ?? hit?.content ?? hit?.text ?? "";
  }
  return "";
}

function extractPending(data: any, locationId: string, locationName: string, source: string) {
  const list: any[] = Array.isArray(data)
    ? data
    : (data.reviews ?? data.content ?? data.feedbacks ?? data.items ?? []);

  return list
    .filter((r: any) => {
      const s = (r.status ?? r.statusCode ?? r.reviewStatus ?? "").toUpperCase();
      return s === "" || s === "PENDING" || s === "NEW" || s === "CONCEPT" || s === "DRAFT" ||
        (s !== "PUBLISHED" && s !== "VERIFIED" && s !== "APPROVED" && s !== "REJECTED" && s !== "DELETED");
    })
    .map((r: any) => ({
      ...r,
      locationId,
      locationName,
      source,
      _id: extractId(r),
      _content: extractContent(r),
    }));
}

async function fetchPendingForLocation(
  baseUrl: string,
  token: string,
  locationId: string,
  source: string,
  locationName: string
): Promise<any[]> {
  const url = `${baseUrl}/review/external?locationId=${locationId}&orderBy=CREATE_DATE&sortOrder=DESC&limit=100`;
  try {
    const res = await fetch(url, { headers: { "X-Publication-Api-Token": token }, cache: "no-store" });
    if (res.status === 429) {
      console.warn(`[${source}] 429 on location ${locationId} — skipping`);
      return [];
    }
    if (!res.ok) return [];
    const data = await res.json();
    return extractPending(data, locationId, locationName, source);
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as any).role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const force   = searchParams.get("force") === "1";
  const loadAll = searchParams.get("all")   === "1";

  const now = Date.now();
  if (!force && cache && now - cache.ts < CACHE_TTL) {
    return NextResponse.json({ ...cache.data, fromCache: true });
  }

  const tokenKIYOH = process.env.KIYOH_API_TOKEN;
  const tokenKV    = process.env.KV_API_TOKEN;

  if (!tokenKIYOH && !tokenKV) {
    return NextResponse.json({ error: "No API tokens configured" }, { status: 500 });
  }

  // --- Step 1: Use the same single-request pattern for locations (from the locations route's cache) ---
  const since  = "2019-01-01T00:00:00.000+00:00";
  const locUrl = (base: string) =>
    `${base}/review/locations/latest?updatedSince=${encodeURIComponent(since)}&dateSince=${encodeURIComponent(since)}&limit=10000`;

  const [kiyohLocs, kvLocs] = await Promise.all([
    tokenKIYOH
      ? fetch(locUrl(KIYOH_BASE), { headers: { "X-Publication-Api-Token": tokenKIYOH }, cache: "no-store" })
          .then(r => r.ok ? r.json() : [])
          .then((d: any) => (Array.isArray(d) ? d : []).map((l: any) => ({ ...l, source: "kiyoh" })))
          .catch(() => [] as any[])
      : Promise.resolve([] as any[]),
    tokenKV
      ? fetch(locUrl(KV_BASE), { headers: { "X-Publication-Api-Token": tokenKV }, cache: "no-store" })
          .then(r => r.ok ? r.json() : [])
          .then((d: any) => (Array.isArray(d) ? d : []).map((l: any) => ({ ...l, source: "kv" })))
          .catch(() => [] as any[])
      : Promise.resolve([] as any[]),
  ]);

  const allLocs = [...kiyohLocs, ...kvLocs];

  // --- Step 2: Only check locations with pending reviews (unless loadAll=1) ---
  const toCheck = loadAll
    ? allLocs
    : allLocs.filter((l: any) => (l.numberReviewsPending ?? 0) > 0);

  console.log(`[moderation] Checking ${toCheck.length}/${allLocs.length} locations`);

  // --- Step 3: Sequential fetch with 1s gap — NO retry, NO infinite loop ---
  const pending: any[] = [];
  for (let i = 0; i < toCheck.length; i++) {
    const loc   = toCheck[i];
    const base  = loc.source === "kv" ? KV_BASE : KIYOH_BASE;
    const token = loc.source === "kv" ? tokenKV : tokenKIYOH;
    if (!token) continue;

    const locationId   = loc.locationId ?? loc.id ?? loc.hashCode;
    const locationName = loc.locationName ?? loc.name ?? loc.companyName ?? locationId;

    const reviews = await fetchPendingForLocation(base, token, locationId, loc.source, locationName);
    pending.push(...reviews);

    if (i < toCheck.length - 1) await sleep(1000); // 1s between requests, no retry
  }

  const data = {
    reviews: pending,
    total: pending.length,
    locationCount: allLocs.length,
    locationsChecked: toCheck.length,
    loadedAll: loadAll,
    fromCache: false,
  };

  if (!loadAll) cache = { data, ts: now };

  return NextResponse.json(data);
}
