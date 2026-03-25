import { NextRequest, NextResponse } from "next/server";
import { getServerSession, Session } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { generatePresignedUploadUrl, getFileAsBuffer } from "@/lib/s3";
import {
  calculateImageHash,
  checkForDuplicates,
  analyzeMetadata,
  detectSuspiciousPatterns,
  calculateFraudRiskScore
} from "@/lib/fraud-detection";

export const dynamic = "force-dynamic";

// Helper function to trigger OCR processing
async function triggerOCR(receiptId: string, session: Session) {
  try {
    const receipt = await prisma.receipt.findUnique({
      where: { id: receiptId }
    });

    if (!receipt) return;

    // Get file content
    const fileBuffer = await getFileAsBuffer(receipt.cloudStoragePath);
    const base64Content = fileBuffer.toString("base64");

    // Determine content type
    const isPdf = receipt.fileType === "pdf" || receipt.originalFilename?.toLowerCase().endsWith(".pdf");
    const mimeType = isPdf ? "application/pdf" : "image/jpeg";
    const dataUri = `data:${mimeType};base64,${base64Content}`;

    const ocrPrompt = `You are a receipt verification expert. Analyze this receipt and extract the following information:

1. Shop/Store name (the business name on the receipt)
2. Transaction date (format: YYYY-MM-DD)
3. Total amount (number only, without currency symbol)
4. Whether the receipt is clearly readable
5. Your confidence level (0-100)
6. Brief reasoning about your analysis

Respond with JSON in this exact format:
{
  "extractedShopName": "string - shop name from receipt, or null if not found",
  "extractedDate": "YYYY-MM-DD or null if not found",
  "extractedAmount": number or null if not found,
  "receiptReadable": true/false,
  "confidence": 0-100,
  "reasoning": "brief explanation"
}

Respond with raw JSON only.`;

    // Prepare messages for LLM
    const messages = isPdf
      ? [
          {
            role: "user" as const,
            content: [
              { type: "text" as const, text: ocrPrompt },
              {
                type: "text" as const,
                text: `[PDF Content attached as base64 - Note: Standard OpenAI/Gemini models may require PDF-to-image conversion or specific PDF support like Gemini 1.5]`
              }
            ]
          }
        ]
      : [
          {
            role: "user" as const,
            content: [
              { type: "text" as const, text: ocrPrompt },
              { type: "image_url" as const, image_url: { url: dataUri } }
            ]
          }
        ];

    // Call LLM API (non-streaming for background processing)
    const aiBaseUrl = process.env.AI_API_BASE_URL || "https://api.openai.com/v1";
    const aiModel = process.env.AI_MODEL_NAME || "gpt-4o-mini";

    const response = await fetch(
      `${aiBaseUrl}/chat/completions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.AI_API_KEY}`
        },
        body: JSON.stringify({
          model: aiModel,
          messages,
          max_tokens: 2000,
          response_format: { type: "json_object" }
        })
      }
    );

    if (!response.ok) {
      throw new Error(`LLM API error: ${response.status}`);
    }

    const llmResult = await response.json();
    const ocrResult = JSON.parse(llmResult.choices[0].message.content);

    // Extract and parse values
    const extractedDate = ocrResult.extractedDate
      ? new Date(ocrResult.extractedDate)
      : null;

    const extractedAmount =
      typeof ocrResult.extractedAmount === "number"
        ? ocrResult.extractedAmount
        : ocrResult.extractedAmount
        ? parseFloat(ocrResult.extractedAmount)
        : null;

    // Check if receipt date is older than 6 months
    let isDateTooOld = false;
    let dateValidationMessage = "";
    if (extractedDate) {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      isDateTooOld = extractedDate < sixMonthsAgo;
      if (isDateTooOld) {
        dateValidationMessage = "Receipt is older than 6 months and cannot be accepted.";
      }
    }

    // Update suspicious patterns with extracted data
    const patternAnalysis = await detectSuspiciousPatterns(
      receipt.userId,
      ocrResult.extractedShopName,
      extractedAmount
    );

    // Update fraud risk score with OCR confidence
    const newFraudRiskScore = calculateFraudRiskScore(
      receipt.isDuplicate,
      receipt.manipulationScore ?? 0,
      patternAnalysis.riskScore,
      ocrResult.confidence ?? 100
    );

    // Determine verification status
    let verificationStatus = "pending";
    if (isDateTooOld) {
      verificationStatus = "rejected";
    } else if (
      ocrResult.confidence >= 70 &&
      ocrResult.receiptReadable &&
      ocrResult.extractedShopName &&
      extractedDate
    ) {
      verificationStatus = "verified";
    } else if (
      !ocrResult.receiptReadable ||
      ocrResult.confidence < 30 ||
      receipt.isDuplicate
    ) {
      verificationStatus = "rejected";
    }

    // Update receipt in database
    await prisma.receipt.update({
      where: { id: receiptId },
      data: {
        extractedShopName: ocrResult.extractedShopName,
        extractedDate,
        extractedAmount,
        ocrConfidence: ocrResult.confidence,
        ocrReasoning: isDateTooOld 
          ? `${ocrResult.reasoning} | ${dateValidationMessage}`
          : ocrResult.reasoning,
        receiptReadable: ocrResult.receiptReadable,
        suspiciousPatterns: JSON.stringify(patternAnalysis.patterns),
        fraudRiskScore: newFraudRiskScore,
        verificationStatus,
        processedAt: new Date()
      }
    });

    console.log(`OCR completed for receipt ${receiptId}: ${verificationStatus}`);
  } catch (error) {
    console.error(`OCR processing failed for receipt ${receiptId}:`, error);
  }
}

async function getAccessToken(userId: string): Promise<string | null> {
  const account = await prisma.account.findFirst({
    where: {
      userId,
      provider: "google"
    }
  });

  if (!account) return null;

  // Check if token is expired (with 5 minute buffer)
  const isExpired = account.expires_at && (account.expires_at * 1000) < (Date.now() + 5 * 60 * 1000);

  if (isExpired && account.refresh_token) {
    // Refresh the token
    try {
      const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID || "",
          client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
          refresh_token: account.refresh_token,
          grant_type: "refresh_token"
        })
      });

      if (response.ok) {
        const tokens = await response.json();
        
        // Update the account with new tokens
        await prisma.account.update({
          where: { id: account.id },
          data: {
            access_token: tokens.access_token,
            expires_at: Math.floor(Date.now() / 1000) + tokens.expires_in
          }
        });

        return tokens.access_token;
      }
    } catch (error) {
      console.error("Token refresh error:", error);
    }
  }

  return account.access_token || null;
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as any).id;
    const accessToken = await getAccessToken(userId);

    if (!accessToken) {
      return NextResponse.json(
        { error: "Google account not connected" },
        { status: 403 }
      );
    }

    const { fileId, fileName, mimeType } = await request.json();

    if (!fileId || !fileName) {
      return NextResponse.json(
        { error: "File ID and name are required" },
        { status: 400 }
      );
    }

    // Download file from Google Drive
    const downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
    const fileResponse = await fetch(downloadUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (!fileResponse.ok) {
      console.error("Failed to download file from Drive:", await fileResponse.text());
      return NextResponse.json(
        { error: "Failed to download file from Google Drive" },
        { status: 500 }
      );
    }

    const fileBuffer = Buffer.from(await fileResponse.arrayBuffer());
    const fileSize = fileBuffer.length;

    // Determine content type
    let contentType = mimeType || "application/octet-stream";
    if (contentType.startsWith("image/")) {
      // Keep as is
    } else if (contentType === "application/pdf") {
      // Keep as is
    } else {
      // Try to detect from filename
      const ext = fileName.toLowerCase().split(".").pop();
      if (ext === "pdf") contentType = "application/pdf";
      else if (["jpg", "jpeg"].includes(ext || "")) contentType = "image/jpeg";
      else if (ext === "png") contentType = "image/png";
    }

    const fileType = contentType.startsWith("image/") ? "image" : "pdf";

    // Generate presigned URL and upload to S3
    const { uploadUrl, cloud_storage_path } = await generatePresignedUploadUrl(
      fileName,
      contentType,
      false
    );

    // Upload to S3
    const uploadResponse = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": contentType
      },
      body: fileBuffer
    });

    if (!uploadResponse.ok) {
      console.error("Failed to upload to S3:", await uploadResponse.text());
      return NextResponse.json(
        { error: "Failed to upload file to storage" },
        { status: 500 }
      );
    }

    // Perform fraud detection
    const imageHash = await calculateImageHash(fileBuffer);
    const duplicateCheck = await checkForDuplicates(imageHash, userId);
    const metadataAnalysis = await analyzeMetadata(fileBuffer);
    const patternAnalysis = await detectSuspiciousPatterns(userId, null, null);
    const fraudRiskScore = calculateFraudRiskScore(
      duplicateCheck.isDuplicate,
      metadataAnalysis.manipulationScore,
      patternAnalysis.riskScore,
      undefined // ocrConfidence is null initially
    );

    // Create receipt record
    const receipt = await prisma.receipt.create({
      data: {
        userId,
        cloudStoragePath: cloud_storage_path,
        isPublic: false,
        originalFilename: fileName,
        fileType,
        fileSize,
        imageHash,
        isDuplicate: duplicateCheck.isDuplicate,
        duplicateOfId: duplicateCheck.duplicateOfId,
        manipulationScore: metadataAnalysis.manipulationScore,
        manipulationFlags: JSON.stringify(metadataAnalysis.flags),
        suspiciousPatterns: JSON.stringify(patternAnalysis.patterns),
        fraudRiskScore,
        verificationStatus: "pending"
      }
    });

    // Trigger OCR processing in the background (non-blocking)
    triggerOCR(receipt.id, session).catch(err => {
      console.error("Background OCR error:", err);
    });

    return NextResponse.json({
      success: true,
      receiptId: receipt.id,
      message: "File imported successfully"
    });
  } catch (error) {
    console.error("Error importing Drive file:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
