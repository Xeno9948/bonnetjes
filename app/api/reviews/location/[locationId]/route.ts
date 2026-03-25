import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";

export const dynamic = "force-dynamic";

const KIYOH_BASE = "https://www.kiyoh.com/v1/publication";
const KV_BASE = "https://www.klantenvertellen.nl/v1/publication";

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
  const page = parseInt(searchParams.get("page") || "1", 10);
  const pageSize = 20;

  const token =
    source === "kv"
      ? process.env.KV_API_TOKEN
      : process.env.KIYOH_API_TOKEN;
  const baseUrl = source === "kv" ? KV_BASE : KIYOH_BASE;

  if (!token) {
    return NextResponse.json({ error: "API token not configured" }, { status: 500 });
  }

  try {
    // Try to fetch reviews for this location
    const url = `${baseUrl}/review/feedbacks?locationId=${params.locationId}&page=${page}&pageSize=${pageSize}`;
    const res = await fetch(url, {
      headers: { "X-Publication-Api-Token": token }
    });

    if (!res.ok) {
      // Fallback: try alternative endpoint pattern
      const altUrl = `${baseUrl}/location/${params.locationId}/reviews?page=${page}&pageSize=${pageSize}`;
      const altRes = await fetch(altUrl, {
        headers: { "X-Publication-Api-Token": token }
      });
      if (!altRes.ok) {
        return NextResponse.json(
          { error: `API error: ${res.status}`, reviews: [], total: 0 },
          { status: 200 }
        );
      }
      const altData = await altRes.json();
      return NextResponse.json(altData);
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Reviews fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch reviews", reviews: [], total: 0 });
  }
}
