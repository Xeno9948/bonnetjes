export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const isAdmin = (session.user as any).role === "admin";
    if (!isAdmin) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const receipts = await prisma.receipt.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { id: true, name: true, email: true } }
      }
    });

    return NextResponse.json(receipts);
  } catch (error) {
    console.error("Admin receipts error:", error);
    return NextResponse.json({ error: "Failed to fetch receipts" }, { status: 500 });
  }

  // PATCH: update status (approve/reject)
}

export async function PATCH(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const isAdmin = (session.user as any).role === "admin";
    if (!isAdmin) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const { id, verificationStatus } = await request.json();
    const updated = await prisma.receipt.update({
      where: { id },
      data: { verificationStatus }
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Admin receipt update error:", error);
    return NextResponse.json({ error: "Failed to update receipt" }, { status: 500 });
  }
}
