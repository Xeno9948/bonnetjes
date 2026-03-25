"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { Header } from "@/components/header";
import {
  Archive,
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Eye,
  Download,
  Calendar,
  DollarSign,
  FileText,
  CheckCircle,
  XCircle,
  Clock,
  X as XIcon,
  ChevronLeft,
  Loader2
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";

interface ReceiptData {
  id: string;
  originalFilename: string;
  extractedShopName: string | null;
  extractedDate: string | null;
  extractedAmount: number | null;
  verificationStatus: string;
  ocrConfidence: number | null;
  fraudRiskScore: number | null;
  archivedAt: string | null;
  user?: { name: string; email: string };
}

export default function ArchivePage() {
  const { data: session, status } = useSession() || {};
  const router = useRouter();
  const { toast } = useToast();
  const [groupedReceipts, setGroupedReceipts] = useState<Record<string, ReceiptData[]>>({});
  const [loading, setLoading] = useState(true);
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const [selectedReceipt, setSelectedReceipt] = useState<ReceiptData | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const isAdmin = (session?.user as any)?.role === "admin";

  const fetchArchive = useCallback(async () => {
    try {
      const response = await fetch("/api/receipts/archive");
      if (response.ok) {
        const data = await response.json();
        setGroupedReceipts(data ?? {});
        // Auto-expand the first date
        const dates = Object.keys(data || {});
        if (dates.length > 0) {
          setExpandedDates(new Set([dates[0]]));
        }
      }
    } catch (error) {
      console.error("Failed to fetch archive:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    } else if (status === "authenticated") {
      fetchArchive();
    }
  }, [status, router, fetchArchive]);

  const toggleDate = (date: string) => {
    setExpandedDates((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(date)) {
        newSet.delete(date);
      } else {
        newSet.add(date);
      }
      return newSet;
    });
  };

  const handleViewReceipt = async (receipt: ReceiptData) => {
    setSelectedReceipt(receipt);
    setLoadingPreview(true);
    try {
      const response = await fetch(`/api/receipts/${receipt.id}/download`);
      if (response.ok) {
        const { downloadUrl } = await response.json();
        setPreviewUrl(downloadUrl);
      }
    } catch (error) {
      console.error("Failed to load preview:", error);
      toast({
        title: "Error",
        description: "Failed to load receipt preview",
        variant: "destructive"
      });
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleDownload = async (receipt: ReceiptData) => {
    try {
      const response = await fetch(`/api/receipts/${receipt.id}/download`);
      if (response.ok) {
        const { downloadUrl, filename } = await response.json();
        const a = document.createElement("a");
        a.href = downloadUrl;
        a.download = filename || "receipt";
        a.click();
      }
    } catch (error) {
      console.error("Download error:", error);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("nl-NL", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric"
    });
  };

  const formatShortDate = (dateStr: string | null) => {
    if (!dateStr) return "N/A";
    return new Date(dateStr).toLocaleDateString("nl-NL");
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "verified":
        return <CheckCircle className="w-4 h-4 text-kv-green" />;
      case "rejected":
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Clock className="w-4 h-4 text-yellow-500" />;
    }
  };

  const sortedDates = Object.keys(groupedReceipts).sort((a, b) => 
    new Date(b).getTime() - new Date(a).getTime()
  );

  const totalArchived = Object.values(groupedReceipts).flat().length;

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-kv-green" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push("/dashboard")}
              className="flex items-center gap-2 text-kv-gray hover:text-kv-green transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
              Terug naar Dashboard
            </button>
          </div>
        </div>

        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Archive className="w-8 h-8 text-kv-green" />
            <h1 className="text-2xl font-bold text-kv-gray">Archief</h1>
          </div>
          <p className="text-gray-600">
            {totalArchived} gearchiveerde bonnen in {sortedDates.length} mappen
          </p>
        </div>

        {/* Date Folders */}
        {sortedDates.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <Archive className="w-16 h-16 mx-auto text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-700 mb-2">Geen gearchiveerde bonnen</h3>
            <p className="text-gray-500">
              Gearchiveerde bonnen worden hier gegroepeerd per datum weergegeven.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {sortedDates.map((dateKey) => {
              const receipts = groupedReceipts[dateKey];
              const isExpanded = expandedDates.has(dateKey);
              const verifiedCount = receipts.filter(r => r.verificationStatus === "verified").length;
              const rejectedCount = receipts.filter(r => r.verificationStatus === "rejected").length;

              return (
                <div key={dateKey} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  {/* Folder Header */}
                  <button
                    onClick={() => toggleDate(dateKey)}
                    className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {isExpanded ? (
                        <FolderOpen className="w-6 h-6 text-kv-orange" />
                      ) : (
                        <Folder className="w-6 h-6 text-kv-orange" />
                      )}
                      <div className="text-left">
                        <h3 className="font-medium text-kv-gray">{formatDate(dateKey)}</h3>
                        <p className="text-sm text-gray-500">
                          {receipts.length} bonnen · 
                          <span className="text-kv-green"> {verifiedCount} goedgekeurd</span> · 
                          <span className="text-red-500"> {rejectedCount} afgewezen</span>
                        </p>
                      </div>
                    </div>
                    {isExpanded ? (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-gray-400" />
                    )}
                  </button>

                  {/* Folder Contents */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden border-t border-gray-100"
                      >
                        <div className="p-4">
                          <table className="w-full">
                            <thead>
                              <tr className="text-left text-xs font-medium text-gray-500 uppercase">
                                <th className="pb-3">Bon</th>
                                <th className="pb-3">Datum</th>
                                <th className="pb-3">Bedrag</th>
                                <th className="pb-3">Status</th>
                                {isAdmin && <th className="pb-3">Gebruiker</th>}
                                <th className="pb-3 text-right">Acties</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {receipts.map((receipt) => (
                                <tr key={receipt.id} className="hover:bg-gray-50">
                                  <td className="py-3">
                                    <div className="flex items-center gap-2">
                                      <FileText className="w-4 h-4 text-gray-400" />
                                      <span className="text-sm font-medium text-kv-gray">
                                        {receipt.originalFilename}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="py-3">
                                    <div className="flex items-center gap-1 text-sm text-gray-600">
                                      <Calendar className="w-3 h-3" />
                                      {formatShortDate(receipt.extractedDate)}
                                    </div>
                                  </td>
                                  <td className="py-3">
                                    <div className="flex items-center gap-1 text-sm text-gray-600">
                                      <DollarSign className="w-3 h-3" />
                                      {receipt.extractedAmount
                                        ? `€${receipt.extractedAmount.toFixed(2)}`
                                        : "N/A"}
                                    </div>
                                  </td>
                                  <td className="py-3">
                                    <div className="flex items-center gap-1">
                                      {getStatusIcon(receipt.verificationStatus)}
                                      <span className="text-sm capitalize">
                                        {receipt.verificationStatus === "verified" ? "Goedgekeurd" :
                                         receipt.verificationStatus === "rejected" ? "Afgewezen" : "In afwachting"}
                                      </span>
                                    </div>
                                  </td>
                                  {isAdmin && (
                                    <td className="py-3 text-sm text-gray-600">
                                      {receipt.user?.name || receipt.user?.email}
                                    </td>
                                  )}
                                  <td className="py-3">
                                    <div className="flex items-center gap-2 justify-end">
                                      <button
                                        onClick={() => handleViewReceipt(receipt)}
                                        className="p-1.5 text-gray-400 hover:text-kv-green rounded-lg hover:bg-gray-100 transition-colors"
                                        title="Bekijken"
                                      >
                                        <Eye className="w-4 h-4" />
                                      </button>
                                      <button
                                        onClick={() => handleDownload(receipt)}
                                        className="p-1.5 text-gray-400 hover:text-kv-green rounded-lg hover:bg-gray-100 transition-colors"
                                        title="Downloaden"
                                      >
                                        <Download className="w-4 h-4" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Preview Modal */}
      <AnimatePresence>
        {selectedReceipt && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => {
              setSelectedReceipt(null);
              setPreviewUrl(null);
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-4 border-b">
                <h3 className="text-lg font-semibold text-kv-gray">
                  {selectedReceipt.originalFilename}
                </h3>
                <button
                  onClick={() => {
                    setSelectedReceipt(null);
                    setPreviewUrl(null);
                  }}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <XIcon className="w-5 h-5" />
                </button>
              </div>
              <div className="p-4 overflow-auto max-h-[calc(90vh-80px)]">
                {loadingPreview ? (
                  <div className="flex items-center justify-center h-64">
                    <Loader2 className="w-8 h-8 animate-spin text-kv-green" />
                  </div>
                ) : previewUrl ? (
                  <div className="flex justify-center">
                    {selectedReceipt.originalFilename?.toLowerCase().endsWith(".pdf") ? (
                      <iframe
                        src={previewUrl}
                        className="w-full h-[70vh] border rounded-lg"
                        title="Receipt PDF"
                      />
                    ) : (
                      <img
                        src={previewUrl}
                        alt="Receipt"
                        className="max-w-full max-h-[70vh] object-contain rounded-lg"
                      />
                    )}
                  </div>
                ) : (
                  <p className="text-center text-gray-500">Failed to load preview</p>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
