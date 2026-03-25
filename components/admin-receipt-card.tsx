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
  Shield,
  Copy,
  User,
  ChevronDown,
  ChevronUp,
  Loader2,
  Check,
  X,
  Flag,
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
  manipulationScore: number | null;
  manipulationFlags: string | null;
  suspiciousPatterns: string | null;
  receiptReadable: boolean | null;
  createdAt: string;
  processedAt: string | null;
  user: { id: string; name: string | null; email: string };
}

interface AdminReceiptCardProps {
  receipt: ReceiptData;
  onStatusUpdate: (id: string, status: string, notes?: string) => void;
  onRefresh: () => void;
}

export function AdminReceiptCard({
  receipt,
  onStatusUpdate,
  onRefresh
}: AdminReceiptCardProps) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [notes, setNotes] = useState("");

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
        description: "Receipt download has started"
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

  const handleStatusChange = async (newStatus: string) => {
    setUpdating(true);
    await onStatusUpdate(receipt.id, newStatus, notes);
    setUpdating(false);
    setNotes("");
    toast({
      title: "Status Updated",
      description: `Receipt marked as ${newStatus}`
    });
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Not extracted";
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return dateString;
    }
  };

  const parseJsonArray = (json: string | null): string[] => {
    if (!json) return [];
    try {
      return JSON.parse(json) ?? [];
    } catch {
      return [];
    }
  };

  const manipulationFlags = parseJsonArray(receipt?.manipulationFlags);
  const suspiciousPatterns = parseJsonArray(receipt?.suspiciousPatterns);

  // Check if receipt is older than 6 months
  const isDateTooOld = receipt?.ocrReasoning?.includes("older than 6 months");

  return (
    <div className="rounded-xl bg-white shadow-sm">
      {/* Main Row */}
      <div className="flex items-center justify-between p-5">
        <div className="flex items-center gap-4">
          <div className="rounded-lg bg-gray-100 p-3">
            <Receipt className="h-6 w-6 text-gray-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">
              {receipt?.extractedShopName ?? "Processing..."}
            </h3>
            <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500">
              <span className="flex items-center gap-1">
                <User className="h-4 w-4" />
                {receipt?.user?.name ?? receipt?.user?.email}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                {formatDate(receipt?.extractedDate)}
              </span>
              {receipt?.extractedAmount !== null && receipt?.extractedAmount !== undefined && (
                <span className="flex items-center gap-1">
                  <DollarSign className="h-4 w-4" />${receipt.extractedAmount.toFixed(2)}
                </span>
              )}
              <span className="flex items-center gap-1 text-xs">
                <FileText className="h-3 w-3" />
                {receipt?.originalFilename}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Date too old warning */}
          {isDateTooOld && (
            <span className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-700">
              <AlertTriangle className="h-3 w-3" />
              &gt;6 Months Old
            </span>
          )}
          {/* Fraud indicators */}
          {receipt?.isDuplicate && (
            <span className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-700">
              <Copy className="h-3 w-3" />
              Duplicate
            </span>
          )}
          {receipt?.fraudRiskScore !== null && receipt.fraudRiskScore >= 50 && (
            <span className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-700">
              <Shield className="h-3 w-3" />
              High Risk
            </span>
          )}

          {/* Status Badge */}
          <div
            className={`flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium ${status.color}`}
          >
            <StatusIcon className="h-4 w-4" />
            {status.label}
          </div>

          {/* Expand Button */}
          <button
            onClick={() => setExpanded(!expanded)}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
          >
            {expanded ? (
              <ChevronUp className="h-5 w-5" />
            ) : (
              <ChevronDown className="h-5 w-5" />
            )}
          </button>
        </div>
      </div>

      {/* Expanded Content */}
      {expanded && (
        <div className="border-t px-5 pb-5 pt-4">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Left Column - Extracted Data */}
            <div>
              <h4 className="mb-3 font-medium text-gray-900">Extracted Data</h4>
              <div className="space-y-3">
                {/* OCR Results */}
                <div className="rounded-lg bg-gray-50 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">AI Confidence</span>
                    <span className="font-bold text-gray-900">
                      {receipt?.ocrConfidence ?? "N/A"}%
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-gray-200">
                    <div
                      className={`h-full ${
                        (receipt?.ocrConfidence ?? 0) >= 80
                          ? "bg-green-500"
                          : (receipt?.ocrConfidence ?? 0) >= 50
                          ? "bg-yellow-500"
                          : "bg-red-500"
                      }`}
                      style={{ width: `${receipt?.ocrConfidence ?? 0}%` }}
                    />
                  </div>
                </div>

                {/* Extracted Data Cards */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-gray-500 flex items-center gap-1">
                      <Store className="h-3 w-3" /> Shop Name
                    </p>
                    <p className="font-medium text-gray-900">
                      {receipt?.extractedShopName ?? "Not extracted"}
                    </p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-gray-500 flex items-center gap-1">
                      <Calendar className="h-3 w-3" /> Date
                    </p>
                    <p className={`font-medium ${isDateTooOld ? "text-red-600" : "text-gray-900"}`}>
                      {formatDate(receipt?.extractedDate)}
                      {isDateTooOld && " (Too old)"}
                    </p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-gray-500 flex items-center gap-1">
                      <DollarSign className="h-3 w-3" /> Amount
                    </p>
                    <p className="font-medium text-gray-900">
                      {receipt?.extractedAmount !== null && receipt?.extractedAmount !== undefined
                        ? `$${receipt.extractedAmount.toFixed(2)}`
                        : "Not extracted"}
                    </p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-gray-500">Readable</p>
                    <p className={`font-medium ${receipt?.receiptReadable ? "text-green-600" : "text-red-600"}`}>
                      {receipt?.receiptReadable ? "Yes" : receipt?.receiptReadable === false ? "No" : "Unknown"}
                    </p>
                  </div>
                </div>

                {/* AI Reasoning */}
                {receipt?.ocrReasoning && (
                  <div className="rounded-lg bg-blue-50 p-3">
                    <p className="text-xs font-medium text-blue-700">AI Analysis</p>
                    <p className="text-sm text-blue-900">{receipt.ocrReasoning}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column - Fraud Detection */}
            <div>
              <h4 className="mb-3 font-medium text-gray-900">Fraud Detection</h4>
              <div className="space-y-3">
                {/* Risk Score */}
                <div className="rounded-lg bg-gray-50 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm font-medium text-gray-700">
                      <Shield className="h-4 w-4" />
                      Fraud Risk Score
                    </span>
                    <span
                      className={`font-bold ${
                        (receipt?.fraudRiskScore ?? 0) >= 50
                          ? "text-red-600"
                          : (receipt?.fraudRiskScore ?? 0) >= 30
                          ? "text-orange-600"
                          : "text-green-600"
                      }`}
                    >
                      {receipt?.fraudRiskScore ?? 0}%
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-gray-200">
                    <div
                      className={`h-full ${
                        (receipt?.fraudRiskScore ?? 0) >= 50
                          ? "bg-red-500"
                          : (receipt?.fraudRiskScore ?? 0) >= 30
                          ? "bg-orange-500"
                          : "bg-green-500"
                      }`}
                      style={{ width: `${receipt?.fraudRiskScore ?? 0}%` }}
                    />
                  </div>
                </div>

                {/* Manipulation Score */}
                {receipt?.manipulationScore !== null && (
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-gray-500">Image Manipulation Score</p>
                    <p
                      className={`font-medium ${
                        (receipt?.manipulationScore ?? 0) >= 30
                          ? "text-red-600"
                          : "text-green-600"
                      }`}
                    >
                      {receipt.manipulationScore}%
                    </p>
                  </div>
                )}

                {/* Flags */}
                {manipulationFlags.length > 0 && (
                  <div className="rounded-lg bg-red-50 p-3">
                    <p className="mb-2 text-xs font-medium text-red-700">
                      Manipulation Flags
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {manipulationFlags.map((flag: string, i: number) => (
                        <span
                          key={i}
                          className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-700"
                        >
                          {flag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {suspiciousPatterns.length > 0 && (
                  <div className="rounded-lg bg-orange-50 p-3">
                    <p className="mb-2 text-xs font-medium text-orange-700">
                      Suspicious Patterns
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {suspiciousPatterns.map((pattern: string, i: number) => (
                        <span
                          key={i}
                          className="rounded bg-orange-100 px-2 py-0.5 text-xs text-orange-700"
                        >
                          {pattern}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="mt-6 border-t pt-4">
            <div className="mb-3">
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Admin Notes (Optional)
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-kv-green focus:outline-none"
                placeholder="Add notes for this action..."
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleDownload}
                disabled={downloading}
                className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
              >
                {downloading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                Download
              </button>

              <button
                onClick={() => handleStatusChange("verified")}
                disabled={updating || receipt?.verificationStatus === "verified"}
                className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
              >
                {updating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Approve
              </button>

              <button
                onClick={() => handleStatusChange("flagged")}
                disabled={updating || receipt?.verificationStatus === "flagged"}
                className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-600 disabled:opacity-50"
              >
                {updating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Flag className="h-4 w-4" />
                )}
                Flag
              </button>

              <button
                onClick={() => handleStatusChange("rejected")}
                disabled={updating || receipt?.verificationStatus === "rejected"}
                className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
              >
                {updating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <X className="h-4 w-4" />
                )}
                Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
