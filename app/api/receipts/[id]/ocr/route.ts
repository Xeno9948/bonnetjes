export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { getFileAsBuffer } from "@/lib/s3";
import { calculateFraudRiskScore, detectSuspiciousPatterns } from "@/lib/fraud-detection";

export async function POST(
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
    let messages: any[];

    if (isPdf) {
      // Upload the PDF to OpenAI Files API so the model can read it natively
      const aiBaseUrlForUpload = process.env.AI_API_BASE_URL || "https://api.openai.com/v1";
      const fileBlob = new Blob([fileBuffer], { type: "application/pdf" });
      const formData = new FormData();
      formData.append("file", fileBlob, receipt.originalFilename || "receipt.pdf");
      formData.append("purpose", "assistants");

      let fileId: string | null = null;
      try {
        const uploadRes = await fetch(`${aiBaseUrlForUpload}/files`, {
          method: "POST",
          headers: { Authorization: `Bearer ${process.env.AI_API_KEY}` },
          body: formData
        });
        if (uploadRes.ok) {
          const uploadData = await uploadRes.json();
          fileId = uploadData.id;
        } else {
          console.warn("OpenAI file upload failed:", await uploadRes.text());
        }
      } catch (e) {
        console.warn("File upload error:", e);
      }

      if (fileId) {
        // Use the uploaded file reference — supported by GPT-4o
        messages = [
          {
            role: "user" as const,
            content: [
              { type: "text" as const, text: ocrPrompt },
              {
                type: "file" as const,
                file: { file_id: fileId }
              }
            ]
          }
        ];
      } else {
        // Fallback: send as image_url with data URI (may not work for all PDFs)
        messages = [
          {
            role: "user" as const,
            content: [
              {
                type: "text" as const,
                text: ocrPrompt + "\n\nNote: This is a PDF document provided as base64. Extract what information you can from the text content."
              },
              { type: "image_url" as const, image_url: { url: dataUri } }
            ]
          }
        ];
      }
    } else {
      messages = [
        {
          role: "user" as const,
          content: [
            {
              type: "text" as const,
              text: ocrPrompt
            },
            {
              type: "image_url" as const,
              image_url: { url: dataUri }
            }
          ]
        }
      ];
    }

    // Call LLM API with streaming
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
          stream: true,
          max_tokens: 2000,
          response_format: { type: "json_object" }
        })
      }
    );

    if (!response.ok) {
      throw new Error(`LLM API error: ${response.status}`);
    }

    // Stream response
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();

    let buffer = "";
    let partialRead = "";

    const stream = new ReadableStream({
      async start(controller) {
        try {
          while (true) {
            const { done, value } = (await reader?.read()) ?? { done: true, value: undefined };
            if (done) break;

            partialRead += decoder.decode(value, { stream: true });
            const lines = partialRead.split("\n");
            partialRead = lines.pop() || "";

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                const data = line.slice(6);
                if (data === "[DONE]") {
                  try {
                    // Parse final result
                    const ocrResult = JSON.parse(buffer);

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
                      where: { id },
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

                    const finalData = JSON.stringify({
                      status: "completed",
                      result: {
                        ...ocrResult,
                        isDateTooOld,
                        dateValidationMessage,
                        fraudRiskScore: newFraudRiskScore,
                        verificationStatus
                      }
                    });
                    controller.enqueue(
                      encoder.encode(`data: ${finalData}\n\n`)
                    );
                  } catch (parseError) {
                    console.error("Parse error:", parseError);
                    controller.enqueue(
                      encoder.encode(
                        `data: ${JSON.stringify({
                          status: "error",
                          message: "Failed to parse OCR result"
                        })}\n\n`
                      )
                    );
                  }
                  return;
                }

                try {
                  const parsed = JSON.parse(data);
                  buffer += parsed.choices?.[0]?.delta?.content || "";
                  const progressData = JSON.stringify({
                    status: "processing",
                    message: "Analyzing receipt..."
                  });
                  controller.enqueue(
                    encoder.encode(`data: ${progressData}\n\n`)
                  );
                } catch {
                  // Skip invalid JSON
                }
              }
            }
          }
        } catch (error) {
          console.error("Stream error:", error);
          controller.error(error);
        } finally {
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive"
      }
    });
  } catch (error) {
    console.error("OCR error:", error);
    return NextResponse.json(
      { error: "Failed to process receipt" },
      { status: 500 }
    );
  }
}
