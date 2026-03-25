"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { Header } from "@/components/header";
import {
  Star,
  Loader2,
  RefreshCw,
  ExternalLink,
  X,
  ThumbsUp,
  ThumbsDown,
  AlertCircle,
  Globe,
  MapPin,
  Users,
  Flag,
  MessageSquare,
  Clock
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface Location {
  locationId: string;
  locationName: string;
  averageRating: number;
  numberReviews: number;
  numberReviewsPending?: number;
  numberReviewsRejected?: number;
  percentageRecommendation: number;
  fiveStars: number;
  fourStars: number;
  threeStars: number;
  twoStars: number;
  oneStars: number;
  viewReviewUrl: string;
  website: string;
  city: string;
  country: string;
  categoryName: string;
  productId: string;
  locationActive: boolean;
  updatedSince: string;
  source: "kiyoh" | "kv";
}

interface Review {
  id?: string;
  reviewId?: string;
  rating?: number;
  totalScore?: number;
  content?: string;
  comment?: string;
  recommendation?: boolean;
  isRecommended?: boolean;
  reviewerName?: string;
  name?: string;
  createdAt?: string;
  publishDate?: string;
  status?: string;
  locationId?: string;
}

type Tab = "all" | "kiyoh" | "kv";

function StarBar({ count, total, stars }: { count: number; total: number; stars: number }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  const color =
    stars >= 5 ? "bg-green-500" : stars >= 4 ? "bg-lime-400" : stars >= 3 ? "bg-yellow-400" : stars >= 2 ? "bg-orange-400" : "bg-red-500";
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-3 text-gray-500">{stars}</span>
      <div className="h-2 flex-1 rounded-full bg-gray-100">
        <div className={`h-2 rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-6 text-right text-gray-500">{count}</span>
    </div>
  );
}

function RatingBadge({ rating }: { rating: number }) {
  const color =
    rating >= 8.5 ? "bg-green-500" : rating >= 7 ? "bg-lime-500" : rating >= 6 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className={`${color} rounded-xl px-3 py-2 text-center text-white shadow-sm`}>
      <p className="text-2xl font-bold leading-none">{rating.toFixed(1)}</p>
      <p className="mt-0.5 text-xs opacity-90">/10</p>
    </div>
  );
}

function SourceBadge({ source }: { source: "kiyoh" | "kv" }) {
  return source === "kiyoh" ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">
      Kiyoh
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-xs font-semibold text-purple-700">
      KV
    </span>
  );
}

function ReviewCard({
  review,
  location,
  onModerate
}: {
  review: Review;
  location: Location;
  onModerate: (reviewId: string, action: "abuse" | "changerequest") => void;
}) {
  const rating = review.rating ?? review.totalScore ?? 0;
  const content = review.content ?? review.comment ?? "";
  const name = review.reviewerName ?? review.name ?? "Anoniem";
  const date = review.createdAt ?? review.publishDate;
  const recommended = review.recommendation ?? review.isRecommended;
  const status = review.status;
  const reviewId = review.id ?? review.reviewId ?? "";
  const [moderating, setModerating] = useState<string | null>(null);

  const handleModerate = async (action: "abuse" | "changerequest") => {
    setModerating(action);
    await onModerate(reviewId, action);
    setModerating(null);
  };

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-kv-green to-kv-green-light font-semibold text-white">
            {name.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="font-medium text-gray-900">{name}</p>
            {date && (
              <p className="text-xs text-gray-500">
                {new Date(date).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" })}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-1">
            {rating > 0 && (
              <span className="rounded-lg bg-gray-100 px-2 py-0.5 text-sm font-bold text-gray-800">
                {typeof rating === "number" && rating > 10 ? (rating / 10).toFixed(1) : rating}
              </span>
            )}
            {typeof recommended === "boolean" && (
              recommended
                ? <ThumbsUp className="h-4 w-4 text-green-500" />
                : <ThumbsDown className="h-4 w-4 text-red-500" />
            )}
          </div>
          {status && status !== "PUBLISHED" && (
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              status === "PENDING" ? "bg-yellow-100 text-yellow-700" :
              status === "REJECTED" ? "bg-red-100 text-red-700" :
              "bg-gray-100 text-gray-600"
            }`}>
              {status}
            </span>
          )}
        </div>
      </div>
      {content && (
        <p className="mt-3 text-sm leading-relaxed text-gray-700">{content}</p>
      )}
      {/* Moderation buttons */}
      {reviewId && (
        <div className="mt-3 flex items-center gap-2 border-t pt-3">
          <button
            onClick={() => handleModerate("changerequest")}
            disabled={!!moderating}
            className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            title="Verzoek reviewer om beoordeling aan te passen"
          >
            {moderating === "changerequest" ? <Loader2 className="h-3 w-3 animate-spin" /> : <MessageSquare className="h-3 w-3" />}
            Wijzigingsverzoek
          </button>
          <button
            onClick={() => handleModerate("abuse")}
            disabled={!!moderating}
            className="flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
            title="Rapporteer als nep/misbruik"
          >
            {moderating === "abuse" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Flag className="h-3 w-3" />}
            Rapporteer
          </button>
        </div>
      )}
    </div>
  );
}

function LocationCard({ location, onSelect }: { location: Location; onSelect: () => void }) {
  const total = location.numberReviews;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm hover:shadow-md hover:border-gray-200 transition-all cursor-pointer"
      onClick={onSelect}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <SourceBadge source={location.source} />
            {!location.locationActive && (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">Inactief</span>
            )}
          </div>
          <h3 className="mt-1.5 text-base font-semibold text-gray-900 truncate">{location.locationName}</h3>
          <p className="flex items-center gap-1 text-xs text-gray-500">
            <MapPin className="h-3 w-3" />
            {location.city}
          </p>
          {location.website && (
            <a
              href={location.website}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="mt-1 flex items-center gap-1 text-xs text-kv-green hover:underline"
            >
              <Globe className="h-3 w-3" />
              {location.website.replace(/https?:\/\//, "").slice(0, 30)}
            </a>
          )}
        </div>
        <RatingBadge rating={location.averageRating} />
      </div>

      {/* Stats row */}
      <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-gray-50 px-3 py-2.5">
        <div className="text-center">
          <p className="text-xs text-gray-500">Reviews</p>
          <p className="text-sm font-bold text-gray-800">{location.numberReviews.toLocaleString()}</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-gray-500">Aanbevolen</p>
          <p className="text-sm font-bold text-green-600">{location.percentageRecommendation}%</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-gray-500">
            {(location.numberReviewsPending ?? 0) > 0 ? "In behandeling" : "Categorie"}
          </p>
          {(location.numberReviewsPending ?? 0) > 0 ? (
            <p className="text-sm font-bold text-yellow-600 flex items-center justify-center gap-1">
              <Clock className="h-3 w-3" />{location.numberReviewsPending}
            </p>
          ) : (
            <p className="truncate text-xs font-medium text-gray-600">{location.categoryName?.replace(/_/g, " ")}</p>
          )}
        </div>
      </div>

      {/* Star bars */}
      <div className="mt-3 space-y-1">
        {[
          { stars: 5, count: location.fiveStars },
          { stars: 4, count: location.fourStars },
          { stars: 3, count: location.threeStars },
          { stars: 2, count: location.twoStars },
          { stars: 1, count: location.oneStars },
        ].map((row) => (
          <StarBar key={row.stars} stars={row.stars} count={row.count} total={total} />
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <a
          href={location.viewReviewUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-kv-green"
        >
          <ExternalLink className="h-3 w-3" />
          Bekijk reviews
        </a>
        <button
          className="flex items-center gap-1 rounded-lg bg-kv-green/10 px-3 py-1.5 text-xs font-medium text-kv-green hover:bg-kv-green/20 transition-colors"
          onClick={onSelect}
        >
          Reviews laden →
        </button>
      </div>
    </motion.div>
  );
}

export default function ReviewsPage() {
  const { data: session, status } = useSession() || {};
  const router = useRouter();

  const [locations, setLocations] = useState<{ kiyoh: Location[]; kv: Location[] }>({ kiyoh: [], kv: [] });
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<{ kiyoh: string | null; kv: string | null }>({ kiyoh: null, kv: null });
  const [activeTab, setActiveTab] = useState<Tab>("all");
  const [sortBy, setSortBy] = useState<"rating" | "reviews" | "name">("rating");
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loadingReviews, setLoadingReviews] = useState(false);

  const isAdmin = (session?.user as any)?.role === "admin";

  const fetchLocations = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/reviews/locations");
      const data = await res.json();
      setLocations({ kiyoh: data.kiyoh || [], kv: data.kv || [] });
      setErrors(data.errors || { kiyoh: null, kv: null });
    } catch {
      setErrors({ kiyoh: "Ophalen mislukt", kv: "Ophalen mislukt" });
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchReviews = useCallback(async (location: Location) => {
    setLoadingReviews(true);
    setReviews([]);
    try {
      const res = await fetch(
        `/api/reviews/location/${location.locationId}?source=${location.source}`
      );
      const data = await res.json();
      const list: Review[] = data.reviews ?? data.feedbacks ?? data.content ?? [];
      setReviews(list);
    } catch {
      setReviews([]);
    } finally {
      setLoadingReviews(false);
    }
  }, []);

  const moderateReview = useCallback(async (
    reviewId: string,
    action: "abuse" | "changerequest",
    location: Location
  ) => {
    try {
      const res = await fetch("/api/reviews/moderate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: location.source,
          action,
          locationId: location.locationId,
          reviewId
        })
      });
      if (!res.ok) throw new Error();
      // Optimistically remove the review from the list after moderation
      setReviews(prev => prev.filter(r => (r.id ?? r.reviewId) !== reviewId));
    } catch {
      // silent fail — user can retry
    }
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
    else if (status === "authenticated") {
      if (!isAdmin) router.replace("/dashboard");
      else fetchLocations();
    }
  }, [status, isAdmin, router, fetchLocations]);

  const handleSelectLocation = (loc: Location) => {
    setSelectedLocation(loc);
    fetchReviews(loc);
  };

  if (status === "loading" || (status === "authenticated" && loading)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-kv-green" />
      </div>
    );
  }

  if (!isAdmin) return null;

  const allLocations = [...locations.kiyoh, ...locations.kv];
  const displayedLocations = (
    activeTab === "kiyoh" ? locations.kiyoh :
    activeTab === "kv" ? locations.kv :
    allLocations
  ).sort((a, b) => {
    if (sortBy === "rating") return b.averageRating - a.averageRating;
    if (sortBy === "reviews") return b.numberReviews - a.numberReviews;
    return a.locationName.localeCompare(b.locationName);
  });

  const avgRating = allLocations.length > 0
    ? (allLocations.reduce((s, l) => s + l.averageRating, 0) / allLocations.length).toFixed(1)
    : "–";
  const totalReviews = allLocations.reduce((s, l) => s + l.numberReviews, 0);

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">

        {/* Page header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Review Platforms</h1>
            <p className="text-sm text-gray-500">Kiyoh & KlantenVertellen locatiedata</p>
          </div>
          <button
            onClick={fetchLocations}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Vernieuwen
          </button>
        </div>

        {/* Summary stats */}
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: "Kiyoh locaties", value: locations.kiyoh.length, color: "text-blue-600", bg: "bg-blue-50" },
            { label: "KV locaties", value: locations.kv.length, color: "text-purple-600", bg: "bg-purple-50" },
            { label: "Gem. beoordeling", value: avgRating, color: "text-green-600", bg: "bg-green-50" },
            { label: "Totaal reviews", value: totalReviews.toLocaleString(), color: "text-gray-800", bg: "bg-gray-100" }
          ].map((s) => (
            <div key={s.label} className={`rounded-xl ${s.bg} p-4`}>
              <p className="text-xs text-gray-500">{s.label}</p>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Error banners */}
        {(errors.kiyoh || errors.kv) && (
          <div className="mb-4 space-y-2">
            {errors.kiyoh && (
              <div className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                Kiyoh: {errors.kiyoh}
              </div>
            )}
            {errors.kv && (
              <div className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                KlantenVertellen: {errors.kv}
              </div>
            )}
          </div>
        )}

        {/* Tabs + sort */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex rounded-xl border border-gray-200 bg-white p-1">
            {([
              { key: "all", label: `Alle (${allLocations.length})` },
              { key: "kiyoh", label: `Kiyoh (${locations.kiyoh.length})` },
              { key: "kv", label: `KV (${locations.kv.length})` }
            ] as { key: Tab; label: string }[]).map((t) => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
                  activeTab === t.key
                    ? "bg-kv-green text-white shadow-sm"
                    : "text-gray-600 hover:text-gray-800"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Sorteren:</span>
            {(["rating", "reviews", "name"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSortBy(s)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  sortBy === s ? "bg-gray-800 text-white" : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
                }`}
              >
                {s === "rating" ? "Beoordeling" : s === "reviews" ? "Aantal" : "Naam"}
              </button>
            ))}
          </div>
        </div>

        {/* Location grid */}
        {displayedLocations.length === 0 && !loading ? (
          <div className="rounded-2xl bg-white py-16 text-center shadow-sm">
            <Users className="mx-auto mb-3 h-12 w-12 text-gray-300" />
            <p className="text-gray-500">Geen locaties gevonden</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {displayedLocations.map((loc) => (
              <LocationCard
                key={`${loc.source}-${loc.locationId}`}
                location={loc}
                onSelect={() => handleSelectLocation(loc)}
              />
            ))}
          </div>
        )}
      </main>

      {/* Review Drawer */}
      <AnimatePresence>
        {selectedLocation && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/40"
              onClick={() => setSelectedLocation(null)}
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col bg-white shadow-2xl"
            >
              {/* Drawer header */}
              <div className="flex items-center justify-between border-b bg-gradient-to-r from-kv-green to-kv-green-light p-5 text-white">
                <div>
                  <div className="flex items-center gap-2">
                    <SourceBadge source={selectedLocation.source} />
                    <h2 className="font-semibold">{selectedLocation.locationName}</h2>
                  </div>
                  <p className="mt-0.5 text-sm text-white/80">
                    {selectedLocation.numberReviews} reviews · {selectedLocation.averageRating.toFixed(1)}/10
                  </p>
                </div>
                <button
                  onClick={() => setSelectedLocation(null)}
                  className="rounded-lg p-1.5 hover:bg-white/20"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Reviews list */}
              <div className="flex-1 overflow-y-auto p-5">
                {loadingReviews ? (
                  <div className="flex flex-col items-center justify-center py-16">
                    <Loader2 className="h-8 w-8 animate-spin text-kv-green" />
                    <p className="mt-2 text-sm text-gray-500">Reviews laden...</p>
                  </div>
                ) : reviews.length === 0 ? (
                  <div className="rounded-xl bg-gray-50 py-12 text-center">
                    <Star className="mx-auto mb-3 h-10 w-10 text-gray-300" />
                    <p className="text-gray-500">Geen reviews beschikbaar</p>
                    <p className="mt-1 text-xs text-gray-400">
                      Reviews API endpoint niet beschikbaar voor dit platform
                    </p>
                    <a
                      href={selectedLocation.viewReviewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-4 inline-flex items-center gap-1 rounded-lg bg-kv-green px-4 py-2 text-sm font-medium text-white hover:bg-kv-green/90"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Open op {selectedLocation.source === "kiyoh" ? "Kiyoh" : "KlantenVertellen"}
                    </a>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs text-gray-500">{reviews.length} reviews geladen</p>
                    {reviews.map((review, i) => (
                      <ReviewCard
                        key={review.id ?? review.reviewId ?? i}
                        review={review}
                        location={selectedLocation}
                        onModerate={(reviewId, action) =>
                          moderateReview(reviewId, action, selectedLocation)
                        }
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Drawer footer */}
              <div className="border-t bg-gray-50 p-4">
                <a
                  href={selectedLocation.viewReviewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-kv-green py-2.5 text-sm font-semibold text-white hover:bg-kv-green/90"
                >
                  <ExternalLink className="h-4 w-4" />
                  Alle reviews op {selectedLocation.source === "kiyoh" ? "Kiyoh" : "KlantenVertellen"}
                </a>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
