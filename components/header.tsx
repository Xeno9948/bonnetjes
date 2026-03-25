"use client";

import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { LogOut, Shield, LayoutDashboard, Menu, X, Star } from "lucide-react";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export function Header() {
  const { data: session } = useSession() || {};
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isAdmin = (session?.user as any)?.role === "admin";

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/klantenvertellen-logo.jpg"
            alt="Klantenvertellen"
            className="h-10 w-auto"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/kiyoh-logo.png"
            alt="Kiyoh"
            className="h-10 w-auto"
          />
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden items-center gap-4 md:flex">
          {session?.user ? (
            <>
              <Link
                href="/dashboard"
                className="flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200"
              >
                <LayoutDashboard className="h-4 w-4" />
                Dashboard
              </Link>
              {isAdmin && (
                <>
                  <Link
                    href="/admin"
                    className="flex items-center gap-2 rounded-lg bg-kv-green/10 px-4 py-2 text-sm font-medium text-kv-green transition-colors hover:bg-kv-green/20"
                  >
                    <Shield className="h-4 w-4" />
                    Admin Panel
                  </Link>
                  <Link
                    href="/admin/reviews"
                    className="flex items-center gap-2 rounded-lg bg-yellow-50 px-4 py-2 text-sm font-medium text-yellow-700 transition-colors hover:bg-yellow-100"
                  >
                    <Star className="h-4 w-4" />
                    Reviews
                  </Link>
                </>
              )}
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="flex items-center gap-2 rounded-lg bg-red-100 px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-200"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
              >
                Sign In
              </Link>
              <Link
                href="/signup"
                className="rounded-lg bg-kv-green px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-kv-green/90"
              >
                Get Started
              </Link>
            </>
          )}
        </nav>

        {/* Mobile Menu Button */}
        <button
          className="md:hidden"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          {mobileMenuOpen ? (
            <X className="h-6 w-6 text-gray-700" />
          ) : (
            <Menu className="h-6 w-6 text-gray-700" />
          )}
        </button>
      </div>

      {/* Mobile Navigation */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="border-t bg-white md:hidden"
          >
            <nav className="flex flex-col gap-2 p-4">
              {session?.user ? (
                <>
                  <Link
                    href="/dashboard"
                    className="flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-3 text-sm font-medium text-gray-700"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <LayoutDashboard className="h-4 w-4" />
                    Dashboard
                  </Link>
                  {isAdmin && (
                    <>
                      <Link
                        href="/admin"
                        className="flex items-center gap-2 rounded-lg bg-kv-green/10 px-4 py-3 text-sm font-medium text-kv-green"
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        <Shield className="h-4 w-4" />
                        Admin Panel
                      </Link>
                      <Link
                        href="/admin/reviews"
                        className="flex items-center gap-2 rounded-lg bg-yellow-50 px-4 py-3 text-sm font-medium text-yellow-700"
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        <Star className="h-4 w-4" />
                        Reviews
                      </Link>
                    </>
                  )}
                  <button
                    onClick={() => {
                      setMobileMenuOpen(false);
                      signOut({ callbackUrl: "/login" });
                    }}
                    className="flex items-center gap-2 rounded-lg bg-red-100 px-4 py-3 text-sm font-medium text-red-700"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign Out
                  </button>
                </>
              ) : (
                <>
                  <Link
                    href="/login"
                    className="rounded-lg px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-100"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Sign In
                  </Link>
                  <Link
                    href="/signup"
                    className="rounded-lg bg-kv-green px-4 py-3 text-center text-sm font-medium text-white"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Get Started
                  </Link>
                </>
              )}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
