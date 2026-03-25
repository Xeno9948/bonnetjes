import crypto from "crypto";
import { prisma } from "./db";

// Simple perceptual hash using average hash algorithm
export function calculateImageHash(imageBuffer: Buffer): string {
  // Create a simple hash of the image content
  // For production, consider using a proper perceptual hashing library
  const hash = crypto.createHash("sha256").update(imageBuffer).digest("hex");
  return hash;
}

// Check for duplicate receipts
export async function checkForDuplicates(
  imageHash: string,
  userId: string,
  excludeReceiptId?: string
): Promise<{ isDuplicate: boolean; duplicateOfId?: string }> {
  const existingReceipts = await prisma.receipt.findMany({
    where: {
      imageHash,
      id: excludeReceiptId ? { not: excludeReceiptId } : undefined
    },
    select: { id: true, userId: true }
  });

  if (existingReceipts.length > 0) {
    return {
      isDuplicate: true,
      duplicateOfId: existingReceipts[0].id
    };
  }

  return { isDuplicate: false };
}

// Analyze image metadata for manipulation indicators
export function analyzeMetadata(fileBuffer: Buffer): {
  manipulationScore: number;
  flags: string[];
} {
  const flags: string[] = [];
  let score = 0;

  // Check file header for common editing software signatures
  const header = fileBuffer.slice(0, 100).toString("hex");
  
  // Check for EXIF data presence (images without EXIF might be manipulated)
  const hasExif = fileBuffer.toString("binary").includes("Exif");
  if (!hasExif) {
    flags.push("NO_EXIF_DATA");
    score += 20;
  }

  // Check for Adobe signatures
  if (fileBuffer.toString("binary").includes("Adobe")) {
    flags.push("ADOBE_SOFTWARE_DETECTED");
    score += 30;
  }

  // Check for GIMP signature
  if (fileBuffer.toString("binary").includes("GIMP")) {
    flags.push("GIMP_SOFTWARE_DETECTED");
    score += 30;
  }

  // Check file size anomalies (very small files might be screenshots)
  if (fileBuffer.length < 50000) {
    flags.push("UNUSUALLY_SMALL_FILE");
    score += 15;
  }

  // Cap score at 100
  score = Math.min(score, 100);

  return { manipulationScore: score, flags };
}

// Detect suspicious submission patterns
export async function detectSuspiciousPatterns(
  userId: string,
  shopName: string | null | undefined,
  amount: number | null | undefined
): Promise<{ patterns: string[]; riskScore: number }> {
  const patterns: string[] = [];
  let riskScore = 0;

  // Get user's recent submissions
  const recentSubmissions = await prisma.receipt.findMany({
    where: {
      userId,
      createdAt: {
        gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
      }
    },
    orderBy: { createdAt: "desc" }
  });

  // Check submission frequency
  if (recentSubmissions.length >= 5) {
    patterns.push("HIGH_SUBMISSION_FREQUENCY");
    riskScore += 25;
  }

  // Check for same shop multiple times (only if shopName is provided)
  if (shopName) {
    const sameShopCount = recentSubmissions.filter(
      (r) => r?.extractedShopName?.toLowerCase() === shopName.toLowerCase()
    ).length;
    if (sameShopCount >= 2) {
      patterns.push("MULTIPLE_SAME_SHOP_SUBMISSIONS");
      riskScore += 20;
    }
  }

  // Check for round amounts (might indicate fabrication)
  if (amount && amount % 10 === 0 && amount > 0) {
    patterns.push("ROUND_AMOUNT_SUSPICIOUS");
    riskScore += 10;
  }

  // Check for very high amounts
  if (amount && amount > 1000) {
    patterns.push("HIGH_AMOUNT_FLAG");
    riskScore += 15;
  }

  // Cap at 100
  riskScore = Math.min(riskScore, 100);

  return { patterns, riskScore };
}

// Calculate overall fraud risk score
export function calculateFraudRiskScore(
  isDuplicate: boolean,
  manipulationScore: number,
  patternRiskScore: number,
  ocrConfidence: number = 100
): number {
  let score = 0;

  // Duplicate check (major risk)
  if (isDuplicate) {
    score += 50;
  }

  // Manipulation indicators
  score += manipulationScore * 0.3;

  // Pattern risks
  score += patternRiskScore * 0.2;

  // Low OCR confidence indicates potential issues
  if (ocrConfidence < 50) {
    score += 20;
  } else if (ocrConfidence < 70) {
    score += 10;
  }

  return Math.min(Math.round(score), 100);
}
