"use client";

import { useState } from "react";
import {
  Receipt,
  Calendar,
  DollarSign,
  Store,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Download,
  RefreshCw,
  Shield,
  Copy,
  Loader2,
  FileText
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ReceiptData {
  id: string;
  originalFilename: string;
  extractedShopName: string | null;
  extractedDate: string | null;
  extractedAmount: number | null;
  verificationStatus: string;
  ocrConfidence: number | null;
  ocrReasoning: string | null;
  fraudRiskScore: number | null;
  isDuplicate: boolean;
  createdAt: string;
  processedAt: string | null;
}

interface ReceiptCardProps {
  receipt: ReceiptData;
  onRefresh: () => void;
}

export function ReceiptCard({ receipt, onRefresh }: ReceiptCardProps) {
  const { toast } = useToast();
  const [downloading, setDownloading] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);

  const getStatusConfig = (status: string) => {
    switch (status) {
      case "verified":
        return {
          icon: CheckCircle,
          color: "text-green-600 bg-green-100",
          label: "Verified"
        };
      case "rejected":
        return {
          icon: XCircle,
          color: "text-red-600 bg-red-100",
          label: "Rejected"
        };
      case "flagged":
        return {
          icon: AlertTriangle,
          color: "text-orange-600 bg-orange-100",
          label: "Flagged"
        };
      default:
        return {
          icon: Clock,
          color: "text-yellow-600 bg-yellow-100",
          label: "Pending"
        };
    }
  };

  const status = getStatusConfig(receipt?.verificationStatus ?? "pending");
  const StatusIcon = status.icon;

  const getFraudRiskColor = (score: number | null) => {
    if (score === null) return "text-gray-600 bg-gray-100";
    if (score >= 50) return "text-red-600 bg-red-100";
    if (score >= 30) return "text-orange-600 bg-orange-100";
    return "text-green-600 bg-green-100";
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const response = await fetch(`/api/receipts/${receipt.id}/download`);
      if (!response.ok) throw new Error("Failed to get download URL");

      const { downloadUrl, filename } = await response.json();

      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = filename || "receipt";
      a.click();

      toast({
        title: "Download Started",
        description: "Your receipt is being downloaded"
      });
    } catch (error) {
      console.error("Download error:", error);
      toast({
        title: "Download Failed",
        description: "Failed to download receipt",
        variant: "destructive"
      });
    } finally {
      setDownloading(false);
    }
  };

  const handleReprocess = async () => {
    setReprocessing(true);
    try {
      const response = await fetch(`/api/receipts/${receipt.id}/ocr`, {
        method: "POST"
      });

      if (response.ok) {
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let partialRead = "";

        while (true) {
          const { done, value } = (await reader?.read()) ?? { done: true, value: undefined };
          if (done) break;

          partialRead += decoder.decode(value, { stream: true });
          const lines = partialRead.split("\n");
          partialRead = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              if (data === "[DONE]") continue;
              try {
                const parsed = JSON.parse(data);
                if (parsed.status === "completed") {
                  toast({
                    title: "Reprocessing Complete",
                    description: "Receipt has been re-analyzed"
                  });
                  onRefresh();
                }
              } catch {}
            }
          }
        }
      }
    } catch (error) {
      console.error("Reprocess error:", error);
      toast({
        title: "Reprocessing Failed",
        description: "Failed to reprocess receipt",
        variant: "destructive"
      });
    } finally {
      setReprocessing(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Not extracted";
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return dateString;
    }
  };

  return (
    <div className="rounded-xl bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      {/* Header */}
      <div className="mb-4 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-gray-100 p-2">
            <Receipt className="h-5 w-5 text-gray-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">
              {receipt?.extractedShopName ?? "Processing..."}
            </h3>
            <p className="text-sm text-gray-500 flex items-center gap-1">
              <FileText className="h-3 w-3" />
              {receipt?.originalFilename ?? "receipt"}
            </p>
          </div>
        </div>
        <div className={`flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${status.color}`}>
          <StatusIcon className="h-3 w-3" />
          {status.label}
        </div>
      </div>

      {/* Extracted Details */}
      <div className="mb-4 grid grid-cols-2 gap-3 text-sm">
        <div className="flex items-center gap-2 text-gray-600">
          <Store className="h-4 w-4" />
          <span className="truncate">{receipt?.extractedShopName ?? "Pending"}</span>
        </div>
        <div className="flex items-center gap-2 text-gray-600">
          <Calendar className="h-4 w-4" />
          <span>{formatDate(receipt?.extractedDate)}</span>
        </div>
        <div className="flex items-center gap-2 text-gray-600 col-span-2">
          <DollarSign className="h-4 w-4" />
          <span>
            {receipt?.extractedAmount !== null && receipt?.extractedAmount !== undefined
              ? `$${receipt.extractedAmount.toFixed(2)}`
              : "Amount not extracted"}
          </span>
        </div>
      </div>

      {/* OCR Results */}
      {receipt?.ocrConfidence !== null && (
        <div className="mb-4 rounded-lg bg-gray-50 p-3">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-gray-600">AI Confidence</span>
            <span className="font-medium text-gray-900">{receipt.ocrConfidence}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-gray-200">
            <div
              className={`h-full transition-all ${
                (receipt.ocrConfidence ?? 0) >= 80
                  ? "bg-green-500"
                  : (receipt.ocrConfidence ?? 0) >= 50
                  ? "bg-yellow-500"
                  : "bg-red-500"
              }`}
              style={{ width: `${receipt.ocrConfidence ?? 0}%` }}
            />
          </div>
          {receipt.ocrReasoning && receipt.ocrReasoning.includes("older than 6 months") && (
            <div className="mt-2 text-xs text-red-600 font-medium">
              ⚠️ Receipt is older than 6 months
            </div>
          )}
        </div>
      )}

      {/* Fraud Indicators */}
      <div className="mb-4 flex flex-wrap gap-2">
        {receipt?.isDuplicate && (
          <span className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-700">
            <Copy className="h-3 w-3" />
            Duplicate
          </span>
        )}
        {receipt?.fraudRiskScore !== null && (
          <span
            className={`flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${getFraudRiskColor(
              receipt.fraudRiskScore
            )}`}
          >
            <Shield className="h-3 w-3" />
            Risk: {receipt.fraudRiskScore}%
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-gray-300 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
        >
          {downloading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          Download
        </button>
        <button
          onClick={handleReprocess}
          disabled={reprocessing}
          className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-kv-green py-2 text-sm font-medium text-white transition-colors hover:bg-kv-green/90 disabled:opacity-50"
        >
          {reprocessing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Reprocess
        </button>
      </div>
    </div>
  );
}
