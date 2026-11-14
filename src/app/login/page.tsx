"use client";

import React, { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { sanitizeRedirectPath } from "@/lib/auth-redirect";
import { invalidateClientCache, setCachedActor } from "@/lib/client-cache";

function LoginFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTarget = sanitizeRedirectPath(searchParams.get("redirect"));

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          redirect: redirectTarget,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || "Sign in failed");
        setLoading(false);
        return;
      }
      if (data.actor) {
        invalidateClientCache();
        setCachedActor(data.actor);
      }
      router.push(data.redirectTo || redirectTarget);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-sm shadow-xs p-6">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4 mb-5">
          <div className="flex items-center gap-3">
            <img
              src="/am-logo-icon.png"
              alt="AM Jewellery"
              className="w-10 h-12 object-contain shrink-0"
            />
            <div>
              <h1 className="text-base font-bold text-slate-900">
                AM Jewellery ERP
              </h1>
              <p className="text-xs text-slate-600 mt-0.5">
                Production Register, Bullion Journal &amp; Billing
              </p>
            </div>
          </div>
          <span className="text-[11px] font-mono px-2 py-0.5 bg-amber-50 border border-amber-300 rounded-xs text-amber-900 font-semibold">
            V2
          </span>
        </div>

        {searchParams.get("redirect") && (
          <div className="mb-4 p-2.5 bg-blue-50 border border-blue-200 rounded-xs text-xs text-blue-900">
            Sign in to continue directly to:{" "}
            <span className="font-mono font-semibold">{redirectTarget}</span>
          </div>
        )}

        {error && (
          <div className="mb-4 p-2.5 bg-red-50 border border-red-300 rounded-xs text-xs font-medium text-red-800">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-800 mb-1">
              Email Address
            </label>
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@amjewellers.local"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-800 mb-1">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 px-4 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white text-xs font-semibold rounded-xs cursor-pointer"
          >
            {loading ? "Signing in..." : "Sign In to V2 Workspace"}
          </button>
        </form>

        <div className="mt-5 pt-4 border-t border-slate-200 text-[11px] text-slate-600 space-y-1">
          <div className="font-semibold text-slate-700">
            Development Bootstrap Accounts (from .env / npm run db:seed):
          </div>
          <div className="font-mono">
            Admin: admin@amjewellers.local / ChangeMeAdmin!2026
          </div>
          <div className="font-mono">
            Operator: operator@amjewellers.local / ChangeMeOperator!2026
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="p-8 text-xs">Loading login...</div>}>
      <LoginFormContent />
    </Suspense>
  );
}

