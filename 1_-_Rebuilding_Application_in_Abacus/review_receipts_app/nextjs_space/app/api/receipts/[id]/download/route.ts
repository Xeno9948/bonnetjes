export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { getFileUrl } from "@/lib/s3";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const userId = (session.user as any).id;
    const isAdmin = (session.user as any).role === "admin";

    const receipt = await prisma.receipt.findUnique({
      where: { id }
    });

    if (!receipt) {
      return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
    }

    // Check access
    if (!isAdmin && receipt.userId !== userId) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Log download action for admins
    if (isAdmin) {
      await prisma.adminAction.create({
        data: {
          adminId: userId,
          receiptId: id,
          action: "download"
        }
      });
    }

    // Get signed URL for download
    const downloadUrl = await getFileUrl(
      receipt.cloudStoragePath,
      receipt.isPublic
    );

    return NextResponse.json({ downloadUrl, filename: receipt.originalFilename });
  } catch (error) {
    console.error("Download error:", error);
    return NextResponse.json(
      { error: "Failed to generate download URL" },
      { status: 500 }
    );
  }
}
