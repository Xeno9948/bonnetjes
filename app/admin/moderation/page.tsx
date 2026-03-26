"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { Header } from "@/components/header";
import {
  Loader2,
  RefreshCw,
  ExternalLink,
  Shield,
  AlertTriangle,
  CheckCircle,
  Clock,
  FileText,
  Image as ImageIcon,
  User,
  Star,
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
  Flag,
  Filter,
  ChevronDown,
  ChevronUp,
  X
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";

interface ModerationReview {
  reviewId?: string;
  id?: string;
  reviewAuthor?: string;
  name?: string;
  rating?: number;
  totalScore?: number;
  reviewContent?: Array<{ questionGroup: string; rating?: number; review?: string }>;
  content?: string;
  comment?: string;
  publishDate?: string;
  createdAt?: string;
  statusCode?: string;
  status?: string;
  attachments?: Array<{ url: string; type: string }>;
  proofOfPurchaseUrl?: string;
  proofUrl?: string;
  imageUrl?: string;
  attachment?: string;
  locationId: string;
  locationName?: string;
  source: "kiyoh" | "kv";
  city?: string;
  recommendation?: boolean;
}

export default function ModerationQueuePage() {
  const { data: session, status } = useSession() || {};
  const router = useRouter();
  const { toast } = useToast();

  const [reviews, setReviews] = useState<ModerationReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [locationCount, setLocationCount] = useState(0);
  const [filter, setFilter] = useState<"all" | "kiyoh" | "kv">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [moderatingId, setModeratingId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const isAdmin = (session?.user as any)?.role === "admin";

  const fetchModeration = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/reviews/moderation");
      if (res.ok) {
        const data = await res.json();
        setReviews(data.reviews ?? []);
        setTotal(data.total ?? 0);
        setLocationCount(data.locationCount ?? 0);
      } else {
        toast({ title: "Fout", description: "Kon moderatiewachtrij niet laden", variant: "destructive" });
      }
    } catch {
      toast({ title: "Fout", description: "Netwerkfout", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
    else if (status === "authenticated" && !isAdmin) router.replace("/dashboard");
    else if (status === "authenticated" && isAdmin) fetchModeration();
  }, [status, isAdmin, router, fetchModeration]);

  const handleModerate = async (
    review: ModerationReview,
    action: "abuse" | "changerequest" | "approve"
  ) => {
    const reviewId = review.reviewId ?? review.id ?? "";
    if (!reviewId) return;
    setModeratingId(reviewId);
    try {
      const res = await fetch("/api/reviews/moderate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: review.source,
          action,
          locationId: review.locationId,
          reviewId
        })
      });
      const data = await res.json();
      if (res.ok) {
        toast({ title: "Succes", description: `Actie '${action}' uitgevoerd` });
        // Remove from queue
        setReviews(prev => prev.filter(r => (r.reviewId ?? r.id) !== reviewId));
      } else {
        toast({
          title: "Fout",
          description: data.detail || data.error || "Actie mislukt",
          variant: "destructive"
        });
      }
    } catch {
      toast({ title: "Fout", description: "Netwerkfout", variant: "destructive" });
    } finally {
      setModeratingId(null);
    }
  };

  if (status === "loading" || (status === "authenticated" && loading)) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header />
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <Loader2 className="mx-auto mb-3 h-10 w-10 animate-spin text-kv-green" />
            <p className="text-gray-600">Moderatiewachtrij laden...</p>
            <p className="mt-1 text-xs text-gray-400">Alle locaties worden doorgelopen — dit kan even duren</p>
          </div>
        </div>
      </div>
    );
  }

  if (status === "unauthenticated" || !isAdmin) return null;

  const filtered = filter === "all" ? reviews : reviews.filter(r => r.source === filter);

  const getReviewId = (r: ModerationReview) => r.reviewId ?? r.id ?? "";
  const getAuthor = (r: ModerationReview) => r.reviewAuthor ?? r.name ?? "Anoniem";
  const getContent = (r: ModerationReview) =>
    r.content ?? r.comment ??
    r.reviewContent?.find(c => c.questionGroup === "DEFAULT_OPINION")?.review ??
    r.reviewContent?.find(c => c.review)?.review ?? "";
  const getRating = (r: ModerationReview) => r.rating ?? r.totalScore ?? 0;
  const getDate = (r: ModerationReview) => r.publishDate ?? r.createdAt;
  const getAttachment = (r: ModerationReview) =>
    r.proofOfPurchaseUrl ?? r.proofUrl ?? r.imageUrl ?? r.attachment ??
    r.attachments?.[0]?.url ?? null;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-kv-green/10 p-3">
              <Shield className="h-6 w-6 text-kv-green" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Review Moderatie</h1>
              <p className="text-sm text-gray-500">
                {loading ? "Laden..." : `${total} reviews in wachtrij · ${locationCount} locaties doorlopen`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchModeration}
              disabled={loading}
              className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Vernieuwen
            </button>
            <button
              onClick={() => router.push("/admin/reviews")}
              className="flex items-center gap-2 rounded-lg bg-kv-green px-4 py-2 text-sm font-medium text-white hover:bg-kv-green/90"
            >
              <ExternalLink className="h-4 w-4" />
              Alle Reviews
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-yellow-100 p-2">
                <Clock className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Totaal in wachtrij</p>
                <p className="text-2xl font-bold text-gray-900">{total}</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-100 p-2">
                <Star className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Kiyoh</p>
                <p className="text-2xl font-bold text-gray-900">{reviews.filter(r => r.source === "kiyoh").length}</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-purple-100 p-2">
                <Star className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">KlantenVertellen</p>
                <p className="text-2xl font-bold text-gray-900">{reviews.filter(r => r.source === "kv").length}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Filter */}
        <div className="mb-4 flex items-center gap-2">
          <Filter className="h-4 w-4 text-gray-400" />
          {(["all", "kiyoh", "kv"] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                filter === f
                  ? "bg-kv-green text-white"
                  : "bg-white text-gray-600 hover:bg-gray-100"
              }`}
            >
              {f === "all" ? "Alles" : f === "kiyoh" ? "Kiyoh" : "KlantenVertellen"}
            </button>
          ))}
        </div>

        {/* Reviews list */}
        {filtered.length === 0 ? (
          <div className="rounded-xl bg-white py-20 text-center shadow-sm">
            <CheckCircle className="mx-auto mb-4 h-14 w-14 text-green-400" />
            <h3 className="text-lg font-semibold text-gray-900">Wachtrij is leeg!</h3>
            <p className="mt-1 text-gray-500">
              {loading ? "Laden..." : "Er zijn momenteel geen reviews in de moderatiewachtrij."}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(review => {
              const rid = getReviewId(review);
              const isExpanded = expandedId === rid;
              const attachment = getAttachment(review);
              const rating = getRating(review);
              const content = getContent(review);
              const date = getDate(review);

              return (
                <motion.div
                  key={`${review.source}-${rid}`}
                  layout
                  className="overflow-hidden rounded-xl bg-white shadow-sm"
                >
                  {/* Review header */}
                  <div className="flex items-center gap-4 p-4">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-kv-green to-kv-green/70 font-semibold text-white">
                      {getAuthor(review).charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-gray-900">{getAuthor(review)}</p>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          review.source === "kiyoh"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-purple-100 text-purple-700"
                        }`}>
                          {review.source === "kiyoh" ? "Kiyoh" : "KV"}
                        </span>
                        {rating > 0 && (
                          <span className="rounded-lg bg-gray-100 px-2 py-0.5 text-sm font-bold text-gray-800">
                            {typeof rating === "number" && rating > 10 ? (rating / 10).toFixed(1) : rating}
                          </span>
                        )}
                        {attachment && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                            <FileText className="h-3 w-3" />
                            Bijlage
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {review.locationName ?? review.locationId}
                        {date && ` · ${new Date(date).toLocaleDateString("nl-NL")}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      {/* Quick actions */}
                      <button
                        onClick={() => handleModerate(review, "abuse")}
                        disabled={moderatingId === rid}
                        className="rounded-lg border border-red-200 p-2 text-red-500 hover:bg-red-50 disabled:opacity-40"
                        title="Melden als misbruik / verwijderen"
                      >
                        {moderatingId === rid ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Flag className="h-4 w-4" />
                        )}
                      </button>
                      <button
                        onClick={() => handleModerate(review, "changerequest")}
                        disabled={moderatingId === rid}
                        className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50 disabled:opacity-40"
                        title="Wijzigingsverzoek sturen"
                      >
                        <MessageSquare className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : rid)}
                        className="rounded-lg border border-gray-200 p-2 text-gray-400 hover:bg-gray-50"
                      >
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Expanded content */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="border-t"
                      >
                        <div className="p-4 grid gap-4 sm:grid-cols-2">
                          {/* Review text */}
                          <div>
                            <h4 className="mb-2 text-xs font-semibold uppercase text-gray-400">Reviewtekst</h4>
                            {content ? (
                              <p className="text-sm leading-relaxed text-gray-800">{content}</p>
                            ) : (
                              <p className="text-sm text-gray-400 italic">Geen tekst beschikbaar</p>
                            )}

                            {/* All review content fields */}
                            {(review.reviewContent ?? []).length > 1 && (
                              <div className="mt-3 space-y-2">
                                {review.reviewContent?.filter(c => c.review).map((c, i) => (
                                  <div key={i} className="rounded-lg bg-gray-50 p-2">
                                    <p className="text-[10px] font-semibold uppercase text-gray-400">{c.questionGroup}</p>
                                    <p className="text-sm text-gray-700">{c.review}</p>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Recommendation */}
                            {typeof review.recommendation === "boolean" && (
                              <div className="mt-3 flex items-center gap-1 text-sm">
                                {review.recommendation
                                  ? <><ThumbsUp className="h-4 w-4 text-green-500" /> <span className="text-green-600">Aanrader</span></>
                                  : <><ThumbsDown className="h-4 w-4 text-red-500" /> <span className="text-red-600">Niet aanrader</span></>
                                }
                              </div>
                            )}
                          </div>

                          {/* Attachment / Proof of purchase */}
                          <div>
                            <h4 className="mb-2 text-xs font-semibold uppercase text-gray-400">Bewijs van aankoop</h4>
                            {attachment ? (
                              <div className="space-y-2">
                                {/* Try to render as image first */}
                                {attachment.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                                  <img
                                    src={attachment}
                                    alt="Bewijs van aankoop"
                                    className="max-h-48 w-full rounded-lg object-contain border bg-gray-50"
                                    onError={e => {
                                      (e.target as HTMLImageElement).style.display = "none";
                                    }}
                                  />
                                ) : (
                                  <div className="flex items-center justify-center rounded-lg border-2 border-dashed border-gray-200 p-6 text-center">
                                    <div>
                                      <FileText className="mx-auto mb-2 h-8 w-8 text-gray-300" />
                                      <p className="text-xs text-gray-500">Document bijlage</p>
                                    </div>
                                  </div>
                                )}
                                <button
                                  onClick={() => setPreviewUrl(attachment)}
                                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-kv-green px-3 py-2 text-sm font-medium text-white hover:bg-kv-green/90"
                                >
                                  <ExternalLink className="h-4 w-4" />
                                  Bekijk bijlage
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-center rounded-lg border-2 border-dashed border-gray-100 p-6 text-center">
                                <div>
                                  <AlertTriangle className="mx-auto mb-2 h-6 w-6 text-yellow-400" />
                                  <p className="text-xs text-gray-500">Geen bijlage gevonden</p>
                                  <p className="mt-1 text-[10px] text-gray-400">
                                    De reviewer heeft mogelijk geen bewijs bijgevoegd
                                  </p>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Action bar */}
                        <div className="flex items-center justify-between border-t bg-gray-50 px-4 py-3">
                          <p className="text-xs text-gray-400">ID: {rid} · {review.source.toUpperCase()}</p>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleModerate(review, "changerequest")}
                              disabled={!!moderatingId}
                              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                            >
                              <MessageSquare className="h-3.5 w-3.5" />
                              Wijzigingsverzoek
                            </button>
                            <button
                              onClick={() => handleModerate(review, "abuse")}
                              disabled={!!moderatingId}
                              className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                            >
                              {moderatingId === rid
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                : <Flag className="h-3.5 w-3.5" />
                              }
                              Verwijder / Misbruik
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        )}
      </main>

      {/* Attachment preview modal */}
      <AnimatePresence>
        {previewUrl && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
            onClick={() => setPreviewUrl(null)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="relative max-h-[90vh] max-w-4xl w-full rounded-2xl bg-white overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <button
                onClick={() => setPreviewUrl(null)}
                className="absolute right-3 top-3 z-10 rounded-lg bg-white/80 p-2 text-gray-700 hover:bg-white shadow"
              >
                <X className="h-5 w-5" />
              </button>
              {previewUrl.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                <img src={previewUrl} alt="Bijlage" className="max-h-[90vh] w-full object-contain" />
              ) : previewUrl.match(/\.pdf$/i) ? (
                <iframe
                  src={`https://docs.google.com/viewer?url=${encodeURIComponent(previewUrl)}&embedded=true`}
                  className="h-[80vh] w-full"
                  title="PDF Bijlage"
                />
              ) : (
                <div className="flex flex-col items-center justify-center p-12">
                  <FileText className="mb-4 h-16 w-16 text-gray-300" />
                  <a
                    href={previewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-lg bg-kv-green px-4 py-2 text-white hover:bg-kv-green/90"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Open in nieuw tabblad
                  </a>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
