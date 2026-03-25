export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { getFileAsBuffer } from "@/lib/s3";
import {
  calculateImageHash,
  checkForDuplicates,
  analyzeMetadata,
  detectSuspiciousPatterns,
  calculateFraudRiskScore
} from "@/lib/fraud-detection";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as any).id;
    const isAdmin = (session.user as any).role === "admin";

    const receipts = await prisma.receipt.findMany({
      where: isAdmin ? {} : { userId },
      include: {
        user: {
          select: { id: true, name: true, email: true }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    return NextResponse.json(receipts);
  } catch (error) {
    console.error("Get receipts error:", error);
    return NextResponse.json(
      { error: "Failed to fetch receipts" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as any).id;
    const body = await request.json();

    const {
      cloudStoragePath,
      isPublic,
      originalFilename,
      fileType,
      fileSize
    } = body;

    if (!cloudStoragePath) {
      return NextResponse.json(
        { error: "Missing cloudStoragePath" },
        { status: 400 }
      );
    }

    // Perform fraud detection
    let imageHash: string | null = null;
    let isDuplicate = false;
    let duplicateOfId: string | undefined;
    let manipulationScore = 0;
    let manipulationFlags: string[] = [];
    let suspiciousPatterns: string[] = [];
    let patternRiskScore = 0;

    try {
      // Get file for analysis
      const fileBuffer = await getFileAsBuffer(cloudStoragePath);

      // Calculate hash for duplicate detection
      imageHash = calculateImageHash(fileBuffer);
      const duplicateCheck = await checkForDuplicates(imageHash, userId);
      isDuplicate = duplicateCheck.isDuplicate;
      duplicateOfId = duplicateCheck.duplicateOfId;

      // Analyze metadata for manipulation
      const metadataAnalysis = analyzeMetadata(fileBuffer);
      manipulationScore = metadataAnalysis.manipulationScore;
      manipulationFlags = metadataAnalysis.flags;

      // Detect suspicious patterns (without expected values, we'll update after OCR)
      const patternAnalysis = await detectSuspiciousPatterns(
        userId,
        null,
        null
      );
      suspiciousPatterns = patternAnalysis.patterns;
      patternRiskScore = patternAnalysis.riskScore;
    } catch (err) {
      console.error("Fraud detection error:", err);
    }

    const fraudRiskScore = calculateFraudRiskScore(
      isDuplicate,
      manipulationScore,
      patternRiskScore,
      100
    );

    // Create receipt record (no expected values required, OCR will extract them)
    const receipt = await prisma.receipt.create({
      data: {
        userId,
        cloudStoragePath,
        isPublic: isPublic ?? false,
        originalFilename: originalFilename ?? "receipt",
        fileType: fileType ?? "image",
        fileSize: fileSize ?? 0,
        verificationStatus: "pending",
        imageHash,
        isDuplicate,
        duplicateOfId,
        manipulationScore,
        manipulationFlags: JSON.stringify(manipulationFlags),
        suspiciousPatterns: JSON.stringify(suspiciousPatterns),
        fraudRiskScore
      }
    });

    return NextResponse.json(receipt, { status: 201 });
  } catch (error) {
    console.error("Create receipt error:", error);
    return NextResponse.json(
      { error: "Failed to create receipt" },
      { status: 500 }
    );
  }
}
