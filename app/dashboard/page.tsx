"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { Header } from "@/components/header";
import { ReceiptUpload } from "@/components/receipt-upload";
import { GoogleDriveImport } from "@/components/google-drive-import";
import {
  Receipt,
  Plus,
  Filter,
  Loader2,
  CheckCircle,
  Clock,
  XCircle,
  AlertTriangle,
  Eye,
  Download,
  RefreshCw,
  Calendar,
  DollarSign,
  FileText,
  Shield,
  Copy,
  X as XIcon,
  ChevronLeft,
  ChevronRight,
  ThumbsUp,
  ThumbsDown,
  Mail,
  FolderOpen,
  Archive,
  CheckSquare,
  Square,
  User,
  Check,
  ExternalLink
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";

const REJECTION_EMAIL_TEMPLATE = `Beste heer/mevrouw,

Wij hebben onlangs een beoordeling van u ontvangen voor het bedrijf via ons platform, waarvoor hartelijk dank. Omdat u niet via een uitnodigingsmail of link van een bedrijf uw beoordeling plaatst, verifiëren wij de bonnen zodat we uw waardevolle beoordeling tussen andere waardevolle beoordelingen van een bedrijf.

Klantenvertellen en Kiyoh zijn omgevingen waar klanten van organisaties beoordelingen achter kunnen laten, om op deze manier toekomstige klanten te ondersteunen in de keuze.

Bij het invullen van uw beoordeling heeft u een bewijs geüpload van uw ervaring met het bedrijf. Echter voldoet deze niet aan de gestelde voorwaarden. Zou u ons een bewijs kunnen terugmailen dat u een ervaring heeft gehad met het bedrijf van de afgelopen zes maanden.

Wat accepteren we als aankoopbewijs?
• Factuur/Kassabon/Retourbon/Bankoverboeking
• Opdrachtbevestiging mits ondertekend door zowel het bedrijf als u

Wat controleren we als aankoopbewijs?
• Bedrijfsnaam
• Plaatsnaam
• Datum (binnen zes maanden, tenzij u door het bedrijf bent uitgenodigd recentelijk)
• Factuur- en/of relatie- klantnummer

Indien wij geen juiste klantbewijs mogen ontvangen, kunnen wij uw beoordeling niet opnemen in de resultaten.

Klantenvertellen en Kiyoh opereren als onafhankelijke review partijen, deze onafhankelijkheid is belangrijk voor ons. Hoe we hiermee omgaan, leest u op onze website. Deze controle doen we conform de nieuwe wetgeving die op 28 mei 2022 is ingegaan. Wij gebruiken de aangeleverde persoonsgegevens dan ook uitsluitend om een verzoek uit te sturen om een review te plaatsen. Vervolgens vernietigen wij de aan klantenvertellen verstrekte persoonsgegevens.

Wij horen graag van u.

Met vriendelijke groet, With kind regards,

Deniz, Review adviseur`;

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
  isArchived: boolean;
}

export default function DashboardPage() {
  const { data: session, status } = useSession() || {};
  const router = useRouter();
  const { toast } = useToast();
  const [receipts, setReceipts] = useState<ReceiptData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [showDriveImport, setShowDriveImport] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const [selectedReceipt, setSelectedReceipt] = useState<ReceiptData | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [reprocessingId, setReprocessingId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [archiving, setArchiving] = useState(false);

  const isAdmin = (session?.user as any)?.role === "admin";
  const [activeTab, setActiveTab] = useState<"receipts" | "queue" | "reviews">("receipts");
  const [adminReceipts, setAdminReceipts] = useState<any[]>([]);
  const [loadingAdmin, setLoadingAdmin] = useState(false);
  const [reviewNotifications, setReviewNotifications] = useState({ count: 0 });

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const selectAllProcessed = () => {
    const processedIds = receipts
      .filter(r => !r.isArchived && r.ocrConfidence !== null)
      .map(r => r.id);
    setSelectedIds(new Set(processedIds));
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const handleArchiveSelected = async () => {
    if (selectedIds.size === 0) return;
    
    setArchiving(true);
    try {
      const response = await fetch("/api/receipts/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receiptIds: Array.from(selectedIds) })
      });

      if (response.ok) {
        const { archivedCount } = await response.json();
        toast({
          title: "Gearchiveerd",
          description: `${archivedCount} bonnen zijn gearchiveerd`
        });
        setSelectedIds(new Set());
        fetchReceipts();
      }
    } catch (error) {
      console.error("Archive error:", error);
      toast({
        title: "Error",
        description: "Failed to archive receipts",
        variant: "destructive"
      });
    } finally {
      setArchiving(false);
    }
  };

  const fetchReceipts = useCallback(async () => {
    try {
      const response = await fetch("/api/receipts");
      if (response.ok) {
        const data = await response.json();
        setReceipts(data ?? []);
      }
    } catch (error) {
      console.error("Failed to fetch receipts:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAdminData = useCallback(async () => {
    if (!isAdmin) return;
    setLoadingAdmin(true);
    try {
      const [receiptsRes, notifyRes] = await Promise.all([
        fetch("/api/admin/receipts").catch(() => fetch("/api/receipts")),
        fetch("/api/admin/reviews/notifications")
      ]);
      if (receiptsRes.ok) {
        const data = await receiptsRes.json();
        setAdminReceipts(data ?? []);
      }
      if (notifyRes.ok) {
        const data = await notifyRes.json();
        setReviewNotifications(data);
      }
    } catch (err) {
      console.error("Admin data fetch failed:", err);
    } finally {
      setLoadingAdmin(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    } else if (status === "authenticated") {
      fetchReceipts();
      if (isAdmin) fetchAdminData();
    }
  }, [status, router, fetchReceipts, fetchAdminData, isAdmin]);

  // Auto-refresh when there are pending/processing receipts
  useEffect(() => {
    const hasPendingReceipts = receipts.some(
      r => r.verificationStatus === "pending" && r.ocrConfidence === null
    );
    
    if (hasPendingReceipts) {
      const interval = setInterval(() => {
        fetchReceipts();
      }, 5000); // Refresh every 5 seconds
      
      return () => clearInterval(interval);
    }
  }, [receipts, fetchReceipts]);

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

  const handleClosePreview = () => {
    setSelectedReceipt(null);
    setPreviewUrl(null);
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

  const handleReprocess = async (receipt: ReceiptData) => {
    setReprocessingId(receipt.id);
    try {
      const response = await fetch(`/api/receipts/${receipt.id}/ocr`, {
        method: "POST"
      });
      if (response.ok) {
        toast({
          title: "Reprocessing Complete",
          description: "Receipt has been reprocessed successfully"
        });
        fetchReceipts();
        if (selectedReceipt?.id === receipt.id) {
          const updatedReceipts = await fetch("/api/receipts").then(r => r.json());
          const updated = updatedReceipts.find((r: ReceiptData) => r.id === receipt.id);
          if (updated) setSelectedReceipt(updated);
        }
      }
    } catch (error) {
      console.error("Reprocess error:", error);
      toast({
        title: "Error",
        description: "Failed to reprocess receipt",
        variant: "destructive"
      });
    } finally {
      setReprocessingId(null);
    }
  };

  const handleStatusUpdate = async (receiptId: string, newStatus: string) => {
    setUpdatingId(receiptId);
    try {
      const response = await fetch(`/api/receipts/${receiptId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verificationStatus: newStatus })
      });

      if (response.ok) {
        toast({
          title: "Status Updated",
          description: `Receipt marked as ${newStatus}`
        });
        fetchReceipts();
        if (selectedReceipt?.id === receiptId) {
          setSelectedReceipt(prev => prev ? { ...prev, verificationStatus: newStatus } : null);
        }
      }
    } catch (error) {
      console.error("Failed to update receipt:", error);
      toast({
        title: "Error",
        description: "Failed to update receipt status",
        variant: "destructive"
      });
    } finally {
      setUpdatingId(null);
    }
  };

  const handleCopyEmail = () => {
    navigator.clipboard.writeText(REJECTION_EMAIL_TEMPLATE);
    toast({
      title: "Copied!",
      description: "Email template copied to clipboard"
    });
  };

  const navigateReceipt = (direction: "prev" | "next") => {
    if (!selectedReceipt) return;
    const currentIndex = filteredReceipts.findIndex(r => r.id === selectedReceipt.id);
    const newIndex = direction === "prev" ? currentIndex - 1 : currentIndex + 1;
    if (newIndex >= 0 && newIndex < filteredReceipts.length) {
      handleViewReceipt(filteredReceipts[newIndex]);
    }
  };

  if (status === "loading" || (status === "authenticated" && loading)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-kv-green" />
      </div>
    );
  }

  if (status === "unauthenticated") {
    return null;
  }

  // Filter out archived receipts from main view
  const activeReceipts = (receipts ?? []).filter(r => !r?.isArchived);
  
  const filteredReceipts = activeReceipts.filter((r) => {
    if (filter === "all") return true;
    if (filter === "rejected") {
      return r?.verificationStatus === "rejected" || r?.verificationStatus === "flagged";
    }
    return r?.verificationStatus === filter;
  });

  const stats = {
    total: activeReceipts.length,
    pending: activeReceipts.filter((r) => r?.verificationStatus === "pending").length,
    verified: activeReceipts.filter((r) => r?.verificationStatus === "verified").length,
    rejected: activeReceipts.filter((r) => r?.verificationStatus === "rejected" || r?.verificationStatus === "flagged").length
  };
  
  const archivedCount = (receipts ?? []).filter(r => r?.isArchived).length;

  const handleUploadComplete = () => {
    setShowUpload(false);
    fetchReceipts();
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "N/A";
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return dateString;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "verified":
        return "bg-green-100 text-green-700";
      case "rejected":
        return "bg-red-100 text-red-700";
      case "flagged":
        return "bg-orange-100 text-orange-700";
      default:
        return "bg-yellow-100 text-yellow-700";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "verified":
        return <CheckCircle className="h-4 w-4" />;
      case "rejected":
        return <XCircle className="h-4 w-4" />;
      case "flagged":
        return <AlertTriangle className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  const currentIndex = selectedReceipt ? filteredReceipts.findIndex(r => r.id === selectedReceipt.id) : -1;
  const isPdf = selectedReceipt?.originalFilename?.toLowerCase().endsWith(".pdf");

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Welcome */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">
            Welcome, {session?.user?.name ?? "User"}
          </h1>
          <p className="text-gray-600">Manage and verify your receipt submissions</p>
        </div>

        {/* Admin Tabs (only for admins) */}
        {isAdmin && (
          <div className="mb-6 flex gap-2 flex-wrap">
            <button
              onClick={() => setActiveTab("receipts")}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === "receipts" ? "bg-kv-green text-white" : "bg-white text-gray-700 hover:bg-gray-100"
              }`}
            >
              <Receipt className="h-4 w-4" />
              My Receipts
            </button>
            <button
              onClick={() => { setActiveTab("queue"); fetchAdminData(); }}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === "queue" ? "bg-kv-green text-white" : "bg-white text-gray-700 hover:bg-gray-100"
              }`}
            >
              <Shield className="h-4 w-4" />
              Review Queue
              {(stats.pending ?? 0) > 0 && activeTab !== "queue" && (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-kv-orange text-[10px] font-bold text-white">
                  {stats.pending}
                </span>
              )}
            </button>
            <button
              onClick={() => router.push("/admin/reviews")}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium bg-kv-green/10 text-kv-green hover:bg-kv-green/20 transition-colors"
            >
              <ExternalLink className="h-4 w-4" />
              Review Platforms
              {reviewNotifications.count > 0 && (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                  {reviewNotifications.count}
                </span>
              )}
            </button>
            <button
              onClick={() => router.push("/admin")}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
            >
              <Shield className="h-4 w-4" />
              Admin Panel
            </button>
          </div>
        )}

        {/* Stats - only for My Receipts tab */}
        {activeTab === "receipts" && (
          <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Total", value: stats.total, icon: Receipt, color: "bg-blue-100 text-blue-600" },
            { label: "Pending", value: stats.pending, icon: Clock, color: "bg-yellow-100 text-yellow-600" },
            { label: "Verified", value: stats.verified, icon: CheckCircle, color: "bg-green-100 text-green-600" },
            { label: "Rejected", value: stats.rejected, icon: XCircle, color: "bg-red-100 text-red-600" }
          ].map((stat) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl bg-white p-4 shadow-sm"
            >
              <div className="flex items-center gap-3">
                <div className={`rounded-lg p-2 ${stat.color}`}>
                  <stat.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">{stat.label}</p>
                  <p className="text-xl font-bold text-gray-900">{stat.value}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
        )}

        {activeTab === "receipts" && (
        <>
        {/* Actions */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Filter className="h-5 w-5 text-gray-500" />
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-kv-green focus:outline-none"
            >
              <option value="all">All Receipts</option>
              <option value="pending">Pending</option>
              <option value="verified">Verified</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowDriveImport(true)}
              className="flex items-center gap-2 rounded-lg border border-kv-green px-4 py-2 font-medium text-kv-green transition-colors hover:bg-kv-green/10"
            >
              <FolderOpen className="h-5 w-5" />
              Google Drive
            </button>
            <button
              onClick={() => setShowUpload(true)}
              className="flex items-center gap-2 rounded-lg bg-kv-green px-4 py-2 font-medium text-white transition-colors hover:bg-kv-green/90"
            >
              <Plus className="h-5 w-5" />
              Upload
            </button>
          </div>
        </div>

        {/* Upload Modal */}
        <AnimatePresence>
          {showUpload && (
            <ReceiptUpload
              onClose={() => setShowUpload(false)}
              onComplete={handleUploadComplete}
            />
          )}
        </AnimatePresence>

        {/* Google Drive Import Modal */}
        <AnimatePresence>
          {showDriveImport && (
            <GoogleDriveImport
              onClose={() => setShowDriveImport(false)}
              onComplete={() => {
                setShowDriveImport(false);
                fetchReceipts();
              }}
            />
          )}
        </AnimatePresence>

        {/* Archive Selection Bar */}
        {selectedIds.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 flex items-center justify-between rounded-lg bg-kv-green/10 px-4 py-3 border border-kv-green/20"
          >
            <div className="flex items-center gap-4">
              <span className="font-medium text-kv-green">
                {selectedIds.size} geselecteerd
              </span>
              <button
                onClick={clearSelection}
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                Deselecteer alles
              </button>
            </div>
            <button
              onClick={handleArchiveSelected}
              disabled={archiving}
              className="flex items-center gap-2 rounded-lg bg-kv-orange px-4 py-2 font-medium text-white transition-colors hover:bg-kv-orange/90 disabled:opacity-50"
            >
              {archiving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Archive className="h-4 w-4" />
              )}
              Archiveren
            </button>
          </motion.div>
        )}

        {/* Receipts List Table */}
        {filteredReceipts.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="rounded-xl bg-white p-12 text-center shadow-sm"
          >
            <Receipt className="mx-auto mb-4 h-12 w-12 text-gray-400" />
            <h3 className="mb-2 text-lg font-semibold text-gray-900">
              No receipts yet
            </h3>
            <p className="mb-4 text-gray-600">
              Upload your first receipt to start verifying your reviews
            </p>
            <button
              onClick={() => setShowUpload(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-kv-green px-4 py-2 font-medium text-white transition-colors hover:bg-kv-green/90"
            >
              <Plus className="h-5 w-5" />
              Upload Receipt
            </button>
          </motion.div>
        ) : (
          <div className="overflow-hidden rounded-xl bg-white shadow-sm">
            {/* Bulk Selection Header */}
            <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b">
              <button
                onClick={selectedIds.size > 0 ? clearSelection : selectAllProcessed}
                className="flex items-center gap-2 text-sm text-gray-600 hover:text-kv-green"
              >
                {selectedIds.size > 0 ? (
                  <>
                    <CheckSquare className="h-4 w-4" />
                    Deselecteer
                  </>
                ) : (
                  <>
                    <Square className="h-4 w-4" />
                    Selecteer alles
                  </>
                )}
              </button>
              {archivedCount > 0 && (
                <button
                  onClick={() => router.push("/archive")}
                  className="flex items-center gap-2 text-sm text-kv-orange hover:text-kv-orange/80"
                >
                  <Archive className="h-4 w-4" />
                  Archief ({archivedCount})
                </button>
              )}
            </div>
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 w-10"></th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Receipt</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Confidence</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Risk</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredReceipts.map((receipt) => (
                  <tr key={receipt.id} className={`hover:bg-gray-50 transition-colors ${selectedIds.has(receipt.id) ? 'bg-kv-green/5' : ''}`}>
                    {/* Selection Checkbox */}
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleSelection(receipt.id)}
                        className="text-gray-400 hover:text-kv-green"
                      >
                        {selectedIds.has(receipt.id) ? (
                          <CheckSquare className="h-5 w-5 text-kv-green" />
                        ) : (
                          <Square className="h-5 w-5" />
                        )}
                      </button>
                    </td>
                    {/* Receipt Info */}
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleViewReceipt(receipt)}
                        className="flex items-center gap-3 text-left hover:text-kv-green"
                      >
                        <div className="rounded-lg bg-gray-100 p-2">
                          <FileText className="h-5 w-5 text-gray-600" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 truncate max-w-[200px]">
                            {receipt.originalFilename}
                          </p>
                          {receipt.extractedShopName && (
                            <p className="text-xs text-gray-500 truncate max-w-[200px]">
                              {receipt.extractedShopName}
                            </p>
                          )}
                        </div>
                      </button>
                    </td>
                    {/* Date */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-gray-400" />
                        <span className="text-sm text-gray-700">
                          {formatDate(receipt.extractedDate)}
                        </span>
                      </div>
                    </td>
                    {/* Amount */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4 text-gray-400" />
                        <span className="text-sm text-gray-700">
                          {receipt.extractedAmount != null
                            ? `$${receipt.extractedAmount.toFixed(2)}`
                            : "N/A"}
                        </span>
                      </div>
                    </td>
                    {/* Confidence */}
                    <td className="px-4 py-3">
                      <span
                        className={`text-sm font-medium ${
                          (receipt.ocrConfidence ?? 0) >= 80
                            ? "text-green-600"
                            : (receipt.ocrConfidence ?? 0) >= 50
                            ? "text-yellow-600"
                            : "text-red-600"
                        }`}
                      >
                        {receipt.ocrConfidence ?? 0}%
                      </span>
                    </td>
                    {/* Risk */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {receipt.isDuplicate && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                            <Copy className="h-3 w-3" />
                            Dup
                          </span>
                        )}
                        <span
                          className={`text-sm font-medium ${
                            (receipt.fraudRiskScore ?? 0) >= 50
                              ? "text-red-600"
                              : (receipt.fraudRiskScore ?? 0) >= 30
                              ? "text-orange-600"
                              : "text-green-600"
                          }`}
                        >
                          {receipt.fraudRiskScore ?? 0}%
                        </span>
                      </div>
                    </td>
                    {/* Status */}
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${getStatusBadge(
                          receipt.verificationStatus
                        )}`}
                      >
                        {getStatusIcon(receipt.verificationStatus)}
                        {receipt.verificationStatus}
                      </span>
                    </td>
                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleViewReceipt(receipt)}
                          className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                          title="View Receipt"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDownload(receipt)}
                          className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                          title="Download"
                        >
                          <Download className="h-4 w-4" />
                        </button>
                        {/* Show Approve for rejected/flagged (admin only) */}
                        {isAdmin && (receipt.verificationStatus === "rejected" || receipt.verificationStatus === "flagged") && (
                          <button
                            onClick={() => handleStatusUpdate(receipt.id, "verified")}
                            disabled={updatingId === receipt.id}
                            className="rounded-lg p-2 text-green-600 hover:bg-green-50 disabled:opacity-50"
                            title="Approve"
                          >
                            {updatingId === receipt.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <ThumbsUp className="h-4 w-4" />
                            )}
                          </button>
                        )}
                        {/* Show Email button for rejected/flagged */}
                        {(receipt.verificationStatus === "rejected" || receipt.verificationStatus === "flagged") && (
                          <button
                            onClick={() => setShowEmailModal(true)}
                            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                            title="Email Template"
                          >
                            <Mail className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          onClick={() => handleReprocess(receipt)}
                          disabled={reprocessingId === receipt.id}
                          className="rounded-lg p-2 text-kv-green hover:bg-kv-green/5 disabled:opacity-50"
                          title="Reprocess"
                        >
                          {reprocessingId === receipt.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        </>
        )}

      </main>

      {/* Receipt Preview Modal */}
      <AnimatePresence>
        {selectedReceipt && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
            onClick={handleClosePreview}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative flex max-h-[90vh] w-full max-w-5xl gap-4 rounded-2xl bg-white p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close button */}
              <button
                onClick={handleClosePreview}
                className="absolute right-4 top-4 z-10 rounded-lg bg-white p-2 text-gray-500 shadow-md hover:bg-gray-100"
              >
                <XIcon className="h-5 w-5" />
              </button>

              {/* Navigation buttons */}
              {currentIndex > 0 && (
                <button
                  onClick={() => navigateReceipt("prev")}
                  className="absolute left-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white p-2 text-gray-600 shadow-md hover:bg-gray-100"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
              )}
              {currentIndex < filteredReceipts.length - 1 && (
                <button
                  onClick={() => navigateReceipt("next")}
                  className="absolute right-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white p-2 text-gray-600 shadow-md hover:bg-gray-100"
                >
                  <ChevronRight className="h-6 w-6" />
                </button>
              )}

              {/* Image Preview */}
              <div className="flex-1 flex items-center justify-center bg-gray-100 rounded-xl overflow-hidden min-h-[500px]">
                {loadingPreview ? (
                  <Loader2 className="h-8 w-8 animate-spin text-kv-green" />
                ) : previewUrl ? (
                  isPdf ? (
                    <iframe
                      src={`https://docs.google.com/viewer?url=${encodeURIComponent(previewUrl)}&embedded=true`}
                      className="w-full h-full min-h-[500px]"
                      title="Receipt PDF"
                    />
                  ) : (
                    <div className="relative w-full h-full min-h-[500px] flex items-center justify-center">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={previewUrl}
                        alt="Receipt"
                        className="max-w-full max-h-full object-contain"
                        style={{ maxHeight: "500px" }}
                      />
                    </div>
                  )
                ) : (
                  <p className="text-gray-500">Failed to load preview</p>
                )}
              </div>

              {/* Details Panel */}
              <div className="w-80 flex-shrink-0 overflow-y-auto">
                <h3 className="text-lg font-bold text-gray-900 mb-4">
                  {selectedReceipt.originalFilename}
                </h3>

                <div className="space-y-4">
                  {/* Status Badge */}
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">Status:</span>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium ${getStatusBadge(
                        selectedReceipt.verificationStatus
                      )}`}
                    >
                      {getStatusIcon(selectedReceipt.verificationStatus)}
                      {selectedReceipt.verificationStatus}
                    </span>
                  </div>

                  {/* Extracted Data */}
                  <div className="space-y-2">
                    <div className="rounded-lg bg-gray-50 p-3">
                      <p className="text-xs text-gray-500 flex items-center gap-1">
                        <Calendar className="h-3 w-3" /> Date
                      </p>
                      <p className="font-medium text-gray-900">
                        {formatDate(selectedReceipt.extractedDate)}
                      </p>
                    </div>
                    <div className="rounded-lg bg-gray-50 p-3">
                      <p className="text-xs text-gray-500 flex items-center gap-1">
                        <DollarSign className="h-3 w-3" /> Amount
                      </p>
                      <p className="font-medium text-gray-900">
                        {selectedReceipt.extractedAmount != null
                          ? `$${selectedReceipt.extractedAmount.toFixed(2)}`
                          : "N/A"}
                      </p>
                    </div>
                  </div>

                  {/* AI Confidence */}
                  <div className="rounded-lg bg-gray-50 p-3">
                    <p className="text-xs text-gray-500">AI Confidence</p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${
                            (selectedReceipt.ocrConfidence ?? 0) >= 80
                              ? "bg-green-500"
                              : (selectedReceipt.ocrConfidence ?? 0) >= 50
                              ? "bg-yellow-500"
                              : "bg-red-500"
                          }`}
                          style={{ width: `${selectedReceipt.ocrConfidence ?? 0}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium">{selectedReceipt.ocrConfidence ?? 0}%</span>
                    </div>
                  </div>

                  {/* Fraud Risk */}
                  <div className="rounded-lg bg-gray-50 p-3">
                    <p className="text-xs text-gray-500 flex items-center gap-1">
                      <Shield className="h-3 w-3" /> Fraud Risk Score
                    </p>
                    <div className="flex items-center gap-2">
                      <p
                        className={`text-xl font-bold ${
                          (selectedReceipt.fraudRiskScore ?? 0) >= 50
                            ? "text-red-600"
                            : (selectedReceipt.fraudRiskScore ?? 0) >= 30
                            ? "text-orange-600"
                            : "text-green-600"
                        }`}
                      >
                        {selectedReceipt.fraudRiskScore ?? 0}%
                      </p>
                      {selectedReceipt.isDuplicate && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                          <Copy className="h-3 w-3" />
                          Duplicate
                        </span>
                      )}
                    </div>
                  </div>

                  {/* AI Reasoning */}
                  {selectedReceipt.ocrReasoning && (
                    <div className="rounded-lg bg-blue-50 p-3">
                      <p className="text-xs font-medium text-blue-700 mb-1">AI Analysis</p>
                      <p className="text-sm text-blue-900">{selectedReceipt.ocrReasoning}</p>
                    </div>
                  )}

                  {/* Approve button for rejected/flagged */}
                  {isAdmin && (selectedReceipt.verificationStatus === "rejected" || selectedReceipt.verificationStatus === "flagged") && (
                    <button
                      onClick={() => handleStatusUpdate(selectedReceipt.id, "verified")}
                      disabled={updatingId === selectedReceipt.id}
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-500 py-2.5 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
                    >
                      {updatingId === selectedReceipt.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ThumbsUp className="h-4 w-4" />
                      )}
                      Approve
                    </button>
                  )}

                  {/* Email button for rejected/flagged */}
                  {(selectedReceipt.verificationStatus === "rejected" || selectedReceipt.verificationStatus === "flagged") && (
                    <button
                      onClick={() => setShowEmailModal(true)}
                      className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      <Mail className="h-4 w-4" />
                      Email
                    </button>
                  )}

                  {/* Action Buttons */}
                  <div className="flex gap-2 pt-4 border-t">
                    <button
                      onClick={() => handleDownload(selectedReceipt)}
                      className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-gray-300 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      <Download className="h-4 w-4" />
                      Download
                    </button>
                    <button
                      onClick={() => handleReprocess(selectedReceipt)}
                      disabled={reprocessingId === selectedReceipt.id}
                      className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-kv-green py-2.5 text-sm font-medium text-white hover:bg-kv-green/90 disabled:opacity-50"
                    >
                      {reprocessingId === selectedReceipt.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                      Reprocess
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Email Template Modal */}
      <AnimatePresence>
        {showEmailModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
            onClick={() => setShowEmailModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close button */}
              <button
                onClick={() => setShowEmailModal(false)}
                className="absolute right-4 top-4 rounded-lg p-2 text-gray-500 hover:bg-gray-100"
              >
                <XIcon className="h-5 w-5" />
              </button>

              <div className="flex items-center gap-2 mb-2">
                <Mail className="h-5 w-5 text-gray-700" />
                <h3 className="text-lg font-bold text-gray-900">Email Template</h3>
              </div>
              <p className="text-sm text-gray-600 mb-4">Copy this template to send to the customer requesting valid proof of purchase</p>

              <div className="rounded-lg bg-gray-50 p-4 max-h-[400px] overflow-y-auto">
                <pre className="whitespace-pre-wrap text-sm text-gray-800 font-mono">
                  {REJECTION_EMAIL_TEMPLATE}
                </pre>
              </div>

              <div className="flex gap-3 mt-6 justify-end">
                <button
                  onClick={() => setShowEmailModal(false)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Close
                </button>
                <button
                  onClick={handleCopyEmail}
                  className="flex items-center gap-2 rounded-lg bg-kv-green px-4 py-2 text-sm font-medium text-white hover:bg-kv-green/90"
                >
                  <Copy className="h-4 w-4" />
                  Copy to Clipboard
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
