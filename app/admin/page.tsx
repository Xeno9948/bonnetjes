"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { Header } from "@/components/header";
import {
  Shield,
  Receipt,
  Users,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  Filter,
  Loader2,
  BarChart3,
  Copy,
  Download,
  Eye,
  Check,
  X as XIcon,
  Flag,
  Calendar,
  DollarSign,
  User,
  FileText,
  ChevronLeft,
  ChevronRight,
  ThumbsUp,
  ThumbsDown,
  Mail
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

interface AdminStats {
  totalReceipts: number;
  pendingCount: number;
  verifiedCount: number;
  rejectedCount: number;
  totalUsers: number;
  fraudStats: {
    averageRiskScore: number;
    duplicateCount: number;
    highRiskCount: number;
  };
  recentActions: Array<{
    id: string;
    action: string;
    createdAt: string;
    admin: { name: string; email: string };
    receipt: { id: string; extractedShopName: string | null };
  }>;
}

interface ReceiptData {
  id: string;
  originalFilename: string;
  cloudStoragePath: string;
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

export default function AdminPage() {
  const { data: session, status } = useSession() || {};
  const router = useRouter();
  const { toast } = useToast();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [receipts, setReceipts] = useState<ReceiptData[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<"queue" | "stats" | "users">("queue");
  const [selectedReceipt, setSelectedReceipt] = useState<ReceiptData | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [updatingUser, setUpdatingUser] = useState<string | null>(null);
  const [reviewNotifications, setReviewNotifications] = useState({ count: 0 });

  const isAdmin = (session?.user as any)?.role === "admin";

  const handleCopyEmail = () => {
    navigator.clipboard.writeText(REJECTION_EMAIL_TEMPLATE);
    toast({
      title: "Copied!",
      description: "Email template copied to clipboard"
    });
  };

  const fetchData = useCallback(async () => {
    try {
      const [statsRes, receiptsRes, usersRes] = await Promise.all([
        fetch("/api/admin/stats"),
        fetch("/api/receipts"),
        fetch("/api/admin/users")
      ]);

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }

      if (receiptsRes.ok) {
        const receiptsData = await receiptsRes.json();
        setReceipts(receiptsData);
      }

      if (usersRes.ok) {
        const usersData = await usersRes.json();
        setUsers(usersData);
      }

      // Fetch review notifications
      const notifyRes = await fetch("/api/admin/reviews/notifications");
      if (notifyRes.ok) {
        const notifyData = await notifyRes.json();
        setReviewNotifications(notifyData);
      }
    } catch (error) {
      console.error("Failed to fetch admin data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRoleChange = async (userId: string, newRole: string) => {
    setUpdatingUser(userId);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role: newRole })
      });
      if (res.ok) {
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
        toast({ title: "Rol bijgewerkt", description: `Gebruiker is nu ${newRole}` });
      }
    } catch {
      toast({ title: "Fout", description: "Rol bijwerken mislukt", variant: "destructive" });
    } finally {
      setUpdatingUser(null);
    }
  };

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    } else if (status === "authenticated") {
      if (!isAdmin) {
        router.replace("/dashboard");
      } else {
        fetchData();
      }
    }
  }, [status, isAdmin, router, fetchData]);

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

  const handleStatusUpdate = async (
    receiptId: string,
    newStatus: string
  ) => {
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
        fetchData();
        // Update selected receipt if it's currently being viewed
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

  if (status === "unauthenticated" || !isAdmin) {
    return null;
  }

  const filteredReceipts = (receipts ?? []).filter((r) => {
    if (filter === "all") return true;
    if (filter === "rejected") {
      return r?.verificationStatus === "rejected" || r?.verificationStatus === "flagged";
    }
    return r?.verificationStatus === filter;
  });

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
        {/* Header */}
        <div className="mb-8 flex items-center gap-3">
          <div className="rounded-xl bg-kv-green/10 p-3">
            <Shield className="h-6 w-6 text-kv-green" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Admin Panel</h1>
            <p className="text-gray-600">Review and manage receipt submissions</p>
          </div>
        </div>

        {/* Stats Overview */}
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl bg-white p-5 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Receipts</p>
                <p className="text-3xl font-bold text-gray-900">
                  {stats?.totalReceipts ?? 0}
                </p>
              </div>
              <div className="rounded-lg bg-blue-100 p-3">
                <Receipt className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="rounded-xl bg-white p-5 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Pending Review</p>
                <p className="text-3xl font-bold text-yellow-600">
                  {stats?.pendingCount ?? 0}
                </p>
              </div>
              <div className="rounded-lg bg-yellow-100 p-3">
                <Clock className="h-6 w-6 text-yellow-600" />
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="rounded-xl bg-white p-5 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Users</p>
                <p className="text-3xl font-bold text-gray-900">
                  {stats?.totalUsers ?? 0}
                </p>
              </div>
              <div className="rounded-lg bg-purple-100 p-3">
                <Users className="h-6 w-6 text-purple-600" />
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="rounded-xl bg-white p-5 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">High Risk</p>
                <p className="text-3xl font-bold text-red-600">
                  {stats?.fraudStats?.highRiskCount ?? 0}
                </p>
              </div>
              <div className="rounded-lg bg-red-100 p-3">
                <AlertTriangle className="h-6 w-6 text-red-600" />
              </div>
            </div>
          </motion.div>
        </div>

        {/* Tabs */}
        <div className="mb-6 flex gap-2 flex-wrap">
          <button
            onClick={() => setActiveTab("queue")}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 font-medium transition-colors ${
              activeTab === "queue"
                ? "bg-kv-green text-white"
                : "bg-white text-gray-700 hover:bg-gray-100"
            }`}
          >
            <Receipt className="h-4 w-4" />
            Review Queue
            {(stats?.pendingCount ?? 0) > 0 && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-kv-orange text-[10px] font-bold text-white">
                {stats?.pendingCount}
              </span>
            )}
          </button>
          <button
            onClick={() => router.push("/admin/reviews")}
            className="flex items-center gap-2 rounded-lg px-4 py-2 font-medium bg-kv-green/10 text-kv-green hover:bg-kv-green/20 transition-colors"
          >
            <Shield className="h-4 w-4" />
            Review Platforms (Full)
            {reviewNotifications.count > 0 && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                {reviewNotifications.count}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("users")}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 font-medium transition-colors ${
              activeTab === "users"
                ? "bg-kv-green text-white"
                : "bg-white text-gray-700 hover:bg-gray-100"
            }`}
          >
            <Users className="h-4 w-4" />
            Gebruikers
          </button>
          <button
            onClick={() => setActiveTab("stats")}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 font-medium transition-colors ${
              activeTab === "stats"
                ? "bg-kv-green text-white"
                : "bg-white text-gray-700 hover:bg-gray-100"
            }`}
          >
            <BarChart3 className="h-4 w-4" />
            Statistieken
          </button>
        </div>

        {activeTab === "queue" && (
          <>
            {/* Filter */}
            <div className="mb-6 flex items-center gap-4">
              <Filter className="h-5 w-5 text-gray-500" />
              <div className="flex flex-wrap gap-2">
                {[
                  { value: "all", label: "All", icon: Receipt },
                  { value: "pending", label: "Pending", icon: Clock },
                  { value: "verified", label: "Verified", icon: CheckCircle },
                  { value: "rejected", label: "Rejected", icon: XCircle }
                ].map((item) => (
                  <button
                    key={item.value}
                    onClick={() => setFilter(item.value)}
                    className={`flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      filter === item.value
                        ? "bg-kv-green/10 text-kv-green/90"
                        : "bg-white text-gray-700 hover:bg-gray-100"
                    }`}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Receipts List Table */}
            {filteredReceipts.length === 0 ? (
              <div className="rounded-xl bg-white p-12 text-center shadow-sm">
                <Receipt className="mx-auto mb-4 h-12 w-12 text-gray-400" />
                <h3 className="mb-2 text-lg font-semibold text-gray-900">
                  No receipts to review
                </h3>
                <p className="text-gray-600">All caught up! Check back later.</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl bg-white shadow-sm">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Receipt</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Risk</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredReceipts.map((receipt) => (
                      <tr key={receipt.id} className="hover:bg-gray-50 transition-colors">
                        {/* Receipt Info */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => handleViewReceipt(receipt)}
                              className="flex items-center gap-2 text-left hover:text-kv-green"
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
                          </div>
                        </td>
                        {/* User */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-gray-400" />
                            <span className="text-sm text-gray-700 truncate max-w-[120px]">
                              {receipt.user?.name || receipt.user?.email}
                            </span>
                          </div>
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
                            <button
                              onClick={() => handleStatusUpdate(receipt.id, "verified")}
                              disabled={updatingId === receipt.id || receipt.verificationStatus === "verified"}
                              className="rounded-lg p-2 text-green-600 hover:bg-green-50 disabled:opacity-50"
                              title="Approve"
                            >
                              {updatingId === receipt.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Check className="h-4 w-4" />
                              )}
                            </button>
                            <button
                              onClick={() => handleStatusUpdate(receipt.id, "rejected")}
                              disabled={updatingId === receipt.id || receipt.verificationStatus === "rejected"}
                              className="rounded-lg p-2 text-red-600 hover:bg-red-50 disabled:opacity-50"
                              title="Reject"
                            >
                              <XIcon className="h-4 w-4" />
                            </button>
                            {receipt.verificationStatus === "rejected" && (
                              <button
                                onClick={() => setShowEmailModal(true)}
                                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                                title="Email Template"
                              >
                                <Mail className="h-4 w-4" />
                              </button>
                            )}
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

        {activeTab === "stats" && (
          <div className="space-y-6">
            {/* Fraud Statistics */}
            <div className="rounded-xl bg-white p-6 shadow-sm">
              <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
                <Shield className="h-5 w-5 text-kv-green" />
                Fraud Detection Statistics
              </h3>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-lg bg-gray-50 p-4">
                  <p className="text-sm text-gray-600">Average Risk Score</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {stats?.fraudStats?.averageRiskScore ?? 0}%
                  </p>
                </div>
                <div className="rounded-lg bg-gray-50 p-4">
                  <div className="flex items-center gap-2">
                    <Copy className="h-4 w-4 text-red-500" />
                    <p className="text-sm text-gray-600">Duplicates Detected</p>
                  </div>
                  <p className="text-2xl font-bold text-red-600">
                    {stats?.fraudStats?.duplicateCount ?? 0}
                  </p>
                </div>
                <div className="rounded-lg bg-gray-50 p-4">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-orange-500" />
                    <p className="text-sm text-gray-600">High Risk Submissions</p>
                  </div>
                  <p className="text-2xl font-bold text-orange-600">
                    {stats?.fraudStats?.highRiskCount ?? 0}
                  </p>
                </div>
              </div>
            </div>

            {/* Recent Actions */}
            <div className="rounded-xl bg-white p-6 shadow-sm">
              <h3 className="mb-4 text-lg font-semibold text-gray-900">Recent Admin Actions</h3>
              {(stats?.recentActions?.length ?? 0) === 0 ? (
                <p className="text-gray-500">No recent actions</p>
              ) : (
                <div className="space-y-3">
                  {stats?.recentActions?.map((action) => (
                    <div key={action.id} className="flex items-center justify-between rounded-lg bg-gray-50 p-3">
                      <div>
                        <p className="font-medium text-gray-900">
                          {action?.admin?.name ?? action?.admin?.email} - {action?.action}
                        </p>
                        <p className="text-sm text-gray-600">
                          Receipt: {action?.receipt?.extractedShopName ?? "Pending"}
                        </p>
                      </div>
                      <p className="text-sm text-gray-500">
                        {action?.createdAt ? new Date(action.createdAt).toLocaleString() : ""}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "users" && (
          <div className="rounded-xl bg-white shadow-sm overflow-hidden">
            <div className="border-b px-6 py-4 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Gebruikersbeheer</h3>
              <span className="text-sm text-gray-500">{users.length} gebruikers</span>
            </div>
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Gebruiker</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Bonnetjes</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Lid sinds</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rol</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actie</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-kv-green/10 text-sm font-semibold text-kv-green">
                          {(u.name || u.email || "?").charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 text-sm">{u.name || "—"}</p>
                          <p className="text-xs text-gray-500">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">{u._count?.receipts ?? 0}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {u.createdAt ? new Date(u.createdAt).toLocaleDateString("nl-NL") : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        u.role === "admin" ? "bg-kv-green/10 text-kv-green" : "bg-gray-100 text-gray-600"
                      }`}>
                        {u.role === "admin" ? "Admin" : "Gebruiker"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {updatingUser === u.id ? (
                        <Loader2 className="h-4 w-4 animate-spin ml-auto text-gray-400" />
                      ) : u.role === "admin" ? (
                        <button
                          onClick={() => handleRoleChange(u.id, "user")}
                          disabled={u.email === "marketing@kiyoh.co.za"}
                          className="rounded-lg border border-gray-200 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          Maak gebruiker
                        </button>
                      ) : (
                        <button
                          onClick={() => handleRoleChange(u.id, "admin")}
                          className="rounded-lg bg-kv-green/10 px-3 py-1 text-xs font-medium text-kv-green hover:bg-kv-green/20"
                        >
                          Maak admin
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
                    <div className="relative w-full h-full min-h-[500px]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={previewUrl}
                        alt="Receipt"
                        className="max-w-full max-h-full object-contain mx-auto"
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

                  {/* User */}
                  <div className="rounded-lg bg-gray-50 p-3">
                    <p className="text-xs text-gray-500 flex items-center gap-1">
                      <User className="h-3 w-3" /> Submitted by
                    </p>
                    <p className="font-medium text-gray-900">
                      {selectedReceipt.user?.name || selectedReceipt.user?.email}
                    </p>
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

                  {/* Action Buttons */}
                  <div className="flex gap-2 pt-4 border-t">
                    <button
                      onClick={() => handleStatusUpdate(selectedReceipt.id, "verified")}
                      disabled={updatingId === selectedReceipt.id || selectedReceipt.verificationStatus === "verified"}
                      className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-green-600 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      {updatingId === selectedReceipt.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4" />
                      )}
                      Approve
                    </button>
                    <button
                      onClick={() => handleStatusUpdate(selectedReceipt.id, "rejected")}
                      disabled={updatingId === selectedReceipt.id || selectedReceipt.verificationStatus === "rejected"}
                      className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-600 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      <XIcon className="h-4 w-4" />
                      Reject
                    </button>
                  </div>
                  {selectedReceipt.verificationStatus === "rejected" && (
                    <button
                      onClick={() => setShowEmailModal(true)}
                      className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      <Mail className="h-4 w-4" />
                      Email
                    </button>
                  )}
                  <button
                    onClick={() => handleDownload(selectedReceipt)}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    <Download className="h-4 w-4" />
                    Download
                  </button>
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
