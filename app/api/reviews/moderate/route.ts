import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";

export const dynamic = "force-dynamic";

const KIYOH_BASE = "https://www.kiyoh.com/v1/publication";
const KV_BASE = "https://www.klantenvertellen.nl/v1/publication";
const TENANT_ID: Record<string, string> = { kiyoh: "98", kv: "99" };

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as any).role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { source, action, locationId, reviewId, reasonAbuse, response: reviewResponse, respondentEmail } = body;

  if (!source || !action || !locationId || !reviewId) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const token = source === "kv" ? process.env.KV_API_TOKEN : process.env.KIYOH_API_TOKEN;
  const baseUrl = source === "kv" ? KV_BASE : KIYOH_BASE;
  const tenantId = TENANT_ID[source] || "98";

  if (!token) {
    return NextResponse.json({ error: "API token not configured" }, { status: 500 });
  }

  let endpoint: string;
  let method: string;
  let payload: Record<string, any>;

  switch (action) {
    case "abuse":
      // Report review for abuse/removal
      endpoint = `${baseUrl}/review/abuse`;
      method = "PUT";
      payload = { locationId, tenantId, reviewId, abuseReason: reasonAbuse || "FAKE_REVIEW" };
      break;

    case "changerequest":
      // Ask reviewer to edit their review
      endpoint = `${baseUrl}/review/changerequest`;
      method = "PUT";
      payload = { locationId, tenantId, reviewId };
      break;

    case "respond":
      // Post a public response to a review
      endpoint = `${baseUrl}/review/external/response`;
      method = "POST";
      payload = { locationId, tenantId, reviewId, response: reviewResponse, respondentEmail };
      break;

    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  console.log(`Moderation action: ${action} for ${source} review ${reviewId} at location ${locationId}`);
  console.log(`Payload:`, JSON.stringify(payload));

  try {
    const res = await fetch(endpoint, {
      method,
      headers: {
        "X-Publication-Api-Token": token,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const resText = await res.text();
    console.log(`API Response (${res.status}):`, resText);

    if (!res.ok) {
      console.error(`Moderation API error ${res.status}:`, resText);
      let errorMessage = `API error: ${res.status}`;
      try {
        const errJson = JSON.parse(resText);
        errorMessage = errJson.message || errJson.error || errJson.detailedError?.[0]?.message || errorMessage;
      } catch {
        // Fallback to raw text or status
      }
      return NextResponse.json({ error: errorMessage, detail: resText }, { status: res.status });
    }

    return NextResponse.json({ success: true, action });
  } catch (error) {
    console.error("Moderation error:", error);
    return NextResponse.json({ error: "Moderation request failed" }, { status: 500 });
  }
}
