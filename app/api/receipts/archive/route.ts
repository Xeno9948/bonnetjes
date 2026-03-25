export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

// Archive receipts
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as any).id;
    const isAdmin = (session.user as any).role === "admin";
    const { receiptIds } = await request.json();

    if (!receiptIds || !Array.isArray(receiptIds)) {
      return NextResponse.json(
        { error: "Receipt IDs required" },
        { status: 400 }
      );
    }

    // Archive the receipts
    const updateFilter: any = {
      id: { in: receiptIds },
      isArchived: false
    };

    // Non-admins can only archive their own receipts
    if (!isAdmin) {
      updateFilter.userId = userId;
    }

    const result = await prisma.receipt.updateMany({
      where: updateFilter,
      data: {
        isArchived: true,
        archivedAt: new Date()
      }
    });

    return NextResponse.json({
      success: true,
      archivedCount: result.count
    });
  } catch (error) {
    console.error("Archive error:", error);
    return NextResponse.json(
      { error: "Failed to archive receipts" },
      { status: 500 }
    );
  }
}

// Get archived receipts grouped by date
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as any).id;
    const isAdmin = (session.user as any).role === "admin";

    const whereClause: any = { isArchived: true };
    if (!isAdmin) {
      whereClause.userId = userId;
    }

    const receipts = await prisma.receipt.findMany({
      where: whereClause,
      include: { user: true },
      orderBy: { archivedAt: "desc" }
    });

    // Group by archive date (day)
    const grouped: Record<string, any[]> = {};
    receipts.forEach((receipt) => {
      const dateKey = receipt.archivedAt
        ? receipt.archivedAt.toISOString().split("T")[0]
        : "unknown";
      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      grouped[dateKey].push(receipt);
    });

    return NextResponse.json(grouped);
  } catch (error) {
    console.error("Fetch archive error:", error);
    return NextResponse.json(
      { error: "Failed to fetch archived receipts" },
      { status: 500 }
    );
  }
}
