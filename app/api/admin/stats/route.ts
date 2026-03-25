export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const isAdmin = (session.user as any).role === "admin";
    if (!isAdmin) {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 }
      );
    }

    const [totalReceipts, pendingCount, verifiedCount, rejectedCount, totalUsers, recentActions] = await Promise.all([
      prisma.receipt.count(),
      prisma.receipt.count({ where: { verificationStatus: "pending" } }),
      prisma.receipt.count({ where: { verificationStatus: "verified" } }),
      prisma.receipt.count({ where: { verificationStatus: { in: ["rejected", "flagged"] } } }),
      prisma.user.count({ where: { role: "user" } }),
      prisma.adminAction.findMany({
        take: 10,
        orderBy: { createdAt: "desc" },
        include: {
          admin: { select: { name: true, email: true } },
          receipt: { select: { id: true, extractedShopName: true } }
        }
      })
    ]);

    // Get fraud stats
    const fraudStats = await prisma.receipt.aggregate({
      _avg: { fraudRiskScore: true },
      _count: { _all: true }
    });

    const duplicateCount = await prisma.receipt.count({
      where: { isDuplicate: true }
    });

    const highRiskCount = await prisma.receipt.count({
      where: { fraudRiskScore: { gte: 50 } }
    });

    return NextResponse.json({
      totalReceipts,
      pendingCount,
      verifiedCount,
      rejectedCount,
      totalUsers,
      fraudStats: {
        averageRiskScore: Math.round(fraudStats._avg?.fraudRiskScore ?? 0),
        duplicateCount,
        highRiskCount
      },
      recentActions
    });
  } catch (error) {
    console.error("Admin stats error:", error);
    return NextResponse.json(
      { error: "Failed to fetch stats" },
      { status: 500 }
    );
  }
}
