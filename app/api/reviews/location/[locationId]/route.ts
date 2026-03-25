import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";

export const dynamic = "force-dynamic";

const KIYOH_BASE = "https://www.kiyoh.com/v1/publication";
const KV_BASE = "https://www.klantenvertellen.nl/v1/publication";

// Tenant IDs per platform (from API docs)
const TENANT_ID: Record<string, string> = {
  kiyoh: "98",
  kv: "99"
};

export async function GET(
  request: NextRequest,
  { params }: { params: { locationId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as any).role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const source = searchParams.get("source") || "kiyoh";
  const orderBy = searchParams.get("orderBy") || "CREATE_DATE";
  const sortOrder = searchParams.get("sortOrder") || "DESC";
  const limit = searchParams.get("limit") || "25";

  const token = source === "kv" ? process.env.KV_API_TOKEN : process.env.KIYOH_API_TOKEN;
  const baseUrl = source === "kv" ? KV_BASE : KIYOH_BASE;
  const tenantId = TENANT_ID[source];

  if (!token) {
    return NextResponse.json({ error: "API token not configured" }, { status: 500 });
  }

  try {
    // Correct endpoint from API docs: /v1/publication/review/external/all
    const url = new URL(`${baseUrl}/review/external/all`);
    url.searchParams.set("locationId", params.locationId);
    url.searchParams.set("tenantId", tenantId);
    url.searchParams.set("orderBy", orderBy);
    url.searchParams.set("sortOrder", sortOrder);
    url.searchParams.set("limit", limit);

    const res = await fetch(url.toString(), {
      headers: { "X-Publication-Api-Token": token }
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`Reviews API error ${res.status}:`, body);
      return NextResponse.json({ reviews: [], total: 0, error: `API ${res.status}` });
    }

    const data = await res.json();
    // Normalise: API returns { reviews: [...] } or array directly
    const reviews = Array.isArray(data) ? data : (data.reviews ?? data.content ?? data.feedbacks ?? []);
    return NextResponse.json({ reviews, total: reviews.length });
  } catch (error) {
    console.error("Reviews fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch reviews", reviews: [], total: 0 });
  }
}
