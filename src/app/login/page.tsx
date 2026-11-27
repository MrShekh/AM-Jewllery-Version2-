"use client";

import React, { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Lock, Mail, ShieldCheck, Sparkles } from "lucide-react";
import { sanitizeRedirectPath } from "@/lib/auth-redirect";
import { invalidateClientCache, setCachedActor } from "@/lib/client-cache";

function LoginFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawRedirectParam = searchParams.get("redirect");
  const redirectTarget = rawRedirectParam
    ? sanitizeRedirectPath(rawRedirectParam)
    : undefined;

  const rawEmailParam = searchParams.get("email");
  const [mode, setMode] = useState<"SIGNIN" | "SIGNUP">("SIGNIN");
  const [showSplash, setShowSplash] = useState(true);
  const [email, setEmail] = useState(rawEmailParam || "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [signupName, setSignupName] = useState("");
  const [signupPhone, setSignupPhone] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupAddress, setSignupAddress] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    const t = setTimeout(() => setShowSplash(false), 1100);
    return () => clearTimeout(t);
  }, []);

  React.useEffect(() => {
    let active = true;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!active || !data?.ok || !data?.actor) return;
        const role = data.actor.role;
        if (role === "CUSTOMER") {
          router.replace("/customer-app");
        } else if (role === "CAD_DESIGNER") {
          router.replace("/cad-dashboard");
        } else {
          router.replace(redirectTarget || "/production-register");
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [router, redirectTarget]);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/customer-app/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: signupName,
          phone: signupPhone,
          email: signupEmail,
          address: signupAddress,
          password: signupPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || "Sign up failed");
        setLoading(false);
        return;
      }
      if (data.actor) {
        invalidateClientCache();
        setCachedActor(data.actor);
      }
      router.push(data.redirectTo || "/customer-app");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setLoading(false);
    }
  }

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
      router.push(data.redirectTo || "/production-register");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setLoading(false);
    }
  }

  if (showSplash) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-24 h-24 rounded-3xl bg-white border border-[#9E7C42]/30 shadow-md flex items-center justify-center p-3 animate-pulse">
          <img
            src="/am-logo-icon.png"
            alt="AM Jewellery"
            className="w-full h-full object-contain"
          />
        </div>
        <h1 className="font-serif text-2xl font-semibold tracking-wide text-[#0F3D2E] mt-5">
          AM Jewellery
        </h1>
        <p className="text-xs text-[#9E7C42] tracking-widest uppercase mt-1">
          Fine Gold &amp; Diamond Craftsmanship
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-[#FAF8F4] text-stone-900">
      {/* Left Branded Atelier Panel */}
      <div className="hidden lg:flex lg:w-[48%] relative overflow-hidden bg-[#121316] text-stone-100 flex-col justify-between p-12">
        {/* Subtle gold radial aura & fine grid */}
        <div
          className="pointer-events-none absolute -top-28 -left-24 h-96 w-96 rounded-full opacity-25 blur-3xl"
          style={{
            background:
              "radial-gradient(circle, #D4AF37 0%, rgba(212,175,55,0) 70%)",
          }}
        />
        <div
          className="pointer-events-none absolute -bottom-32 -right-24 h-[28rem] w-[28rem] rounded-full opacity-20 blur-3xl"
          style={{
            background:
              "radial-gradient(circle, #B8860B 0%, rgba(184,134,11,0) 70%)",
          }}
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage:
              "linear-gradient(to right, #D4AF37 1px, transparent 1px), linear-gradient(to bottom, #D4AF37 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />

        {/* Top Emblem */}
        <div className="relative z-10 flex items-center gap-3.5">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-amber-200/20 to-amber-500/10 border border-amber-400/30 flex items-center justify-center p-2 shadow-inner">
            <img
              src="/am-logo-icon.png"
              alt="AM Jewellery"
              className="h-full w-full object-contain"
            />
          </div>
          <div>
            <div className="text-sm font-semibold tracking-[0.2em] uppercase text-amber-300">
              AM Jewellery
            </div>
            <div className="text-xs text-stone-400">
              Workshop &amp; Bullion Ledger
            </div>
          </div>
        </div>

        {/* Center Hero Copy */}
        <div className="relative z-10 max-w-md space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-[11px] font-medium text-amber-200">
            <Sparkles className="h-3.5 w-3.5 text-amber-300" />
            <span>Precision Gold Manufacturing ERP</span>
          </div>

          <h2 className="text-3xl font-semibold tracking-tight text-white leading-snug">
            Every gram accounted,{" "}
            <span className="text-amber-300">from karigar bench to final bill.</span>
          </h2>

          <p className="text-sm text-stone-400 leading-relaxed">
            Manage Filing, Polish, and Setting orders, track fine-gold equivalents,
            recover karigar loss, and send PDF invoices directly to customers.
          </p>

          <div className="grid grid-cols-3 gap-3 pt-2">
            <div className="rounded-lg border border-stone-800 bg-stone-900/70 p-3">
              <div className="text-xs font-semibold text-amber-300">Orders</div>
              <div className="mt-1 text-[11px] text-stone-400">
                Bag QR &amp; live stage tracking
              </div>
            </div>
            <div className="rounded-lg border border-stone-800 bg-stone-900/70 p-3">
              <div className="text-xs font-semibold text-amber-300">Bullion</div>
              <div className="mt-1 text-[11px] text-stone-400">
                Touch-wise &amp; fine gold stock
              </div>
            </div>
            <div className="rounded-lg border border-stone-800 bg-stone-900/70 p-3">
              <div className="text-xs font-semibold text-amber-300">Billing</div>
              <div className="mt-1 text-[11px] text-stone-400">
                Customer dues &amp; PDF share
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="relative z-10 flex items-center justify-between text-[11px] text-stone-500 border-t border-stone-800/80 pt-5">
          <span>AM Jewellers • Asia/Kolkata</span>
          <span className="inline-flex items-center gap-1.5 text-stone-400">
            <ShieldCheck className="h-3.5 w-3.5 text-amber-400" />
            Encrypted Session Access
          </span>
        </div>
      </div>

      {/* Right Sign-In Panel */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md space-y-6">
          {/* Mobile Brand Header */}
          <div className="flex lg:hidden items-center justify-center gap-3 pb-2">
            <div className="h-11 w-11 rounded-xl bg-[#121316] border border-amber-400/40 flex items-center justify-center p-2">
              <img
                src="/am-logo-icon.png"
                alt="AM Jewellery"
                className="h-full w-full object-contain"
              />
            </div>
            <div>
              <div className="text-base font-bold tracking-wide text-stone-900">
                AM Jewellery
              </div>
              <div className="text-xs text-stone-500">
                Workshop &amp; Bullion ERP
              </div>
            </div>
          </div>

          <div className="bg-white border border-stone-200/90 rounded-2xl shadow-[0_12px_40px_-12px_rgba(28,25,23,0.12)] p-7 sm:p-8 space-y-5">
            <div className="flex gap-1.5 p-1 bg-stone-100 rounded-xl text-xs font-semibold">
              <button
                type="button"
                onClick={() => {
                  setMode("SIGNIN");
                  setError(null);
                }}
                className={`flex-1 py-2 rounded-lg cursor-pointer transition-colors ${
                  mode === "SIGNIN"
                    ? "bg-white text-stone-900 shadow-2xs"
                    : "text-stone-600 hover:text-stone-900"
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("SIGNUP");
                  setError(null);
                }}
                className={`flex-1 py-2 rounded-lg cursor-pointer transition-colors ${
                  mode === "SIGNUP"
                    ? "bg-[#0F3D2E] text-white shadow-2xs"
                    : "text-stone-600 hover:text-stone-900"
                }`}
              >
                Customer Sign Up
              </button>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <h1 className="text-xl font-bold tracking-tight text-stone-900">
                  {mode === "SIGNIN" ? "Welcome back" : "Create Customer Account"}
                </h1>
                <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                  AM Jewellery
                </span>
              </div>
              <p className="text-xs text-stone-500">
                {mode === "SIGNIN"
                  ? "Sign in with your Email or Phone Number."
                  : "Register your showroom or personal profile to place orders."}
              </p>
            </div>

            {searchParams.get("redirect") && mode === "SIGNIN" && (
              <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-lg text-xs text-amber-900">
                Continue to:{" "}
                <span className="font-mono font-semibold">{redirectTarget}</span>
              </div>
            )}

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs font-medium text-red-700">
                {error}
              </div>
            )}

            {mode === "SIGNIN" ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                  Email or Phone Number
                </label>
                <div className="relative">
                  <Mail className="h-4 w-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    required
                    autoFocus
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email or 10-digit phone"
                    className="w-full pl-9 pr-3 py-2.5 text-sm bg-stone-50/60 border border-stone-300 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-600 transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <Lock className="h-4 w-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full pl-9 pr-10 py-2.5 text-sm bg-stone-50/60 border border-stone-300 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-600 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-stone-400 hover:text-stone-700 cursor-pointer"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 rounded-lg text-sm font-semibold text-white bg-[#121316] hover:bg-stone-800 disabled:opacity-50 shadow-sm transition-all cursor-pointer flex items-center justify-center gap-2 border border-amber-500/30"
              >
                <span>{loading ? "Signing in..." : "Sign In"}</span>
              </button>
            </form>
            ) : (
            <form onSubmit={handleSignup} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Name / Showroom Name *
                </label>
                <input
                  type="text"
                  required
                  value={signupName}
                  onChange={(e) => setSignupName(e.target.value)}
                  placeholder="e.g. Subham Jewellers"
                  className="w-full px-3 py-2 text-sm bg-stone-50/60 border border-stone-300 rounded-lg focus:bg-white focus:outline-none focus:border-[#0F3D2E]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Phone Number *
                </label>
                <input
                  type="tel"
                  required
                  value={signupPhone}
                  onChange={(e) => setSignupPhone(e.target.value)}
                  placeholder="10-digit mobile number"
                  className="w-full px-3 py-2 text-sm font-mono bg-stone-50/60 border border-stone-300 rounded-lg focus:bg-white focus:outline-none focus:border-[#0F3D2E]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Email (Optional)
                </label>
                <input
                  type="email"
                  value={signupEmail}
                  onChange={(e) => setSignupEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full px-3 py-2 text-sm bg-stone-50/60 border border-stone-300 rounded-lg focus:bg-white focus:outline-none focus:border-[#0F3D2E]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  City / Showroom Address
                </label>
                <input
                  type="text"
                  value={signupAddress}
                  onChange={(e) => setSignupAddress(e.target.value)}
                  placeholder="Shop / City"
                  className="w-full px-3 py-2 text-sm bg-stone-50/60 border border-stone-300 rounded-lg focus:bg-white focus:outline-none focus:border-[#0F3D2E]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Create Password *
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={6}
                    value={signupPassword}
                    onChange={(e) => setSignupPassword(e.target.value)}
                    placeholder="Min 6 characters"
                    className="w-full pl-3 pr-10 py-2 text-sm bg-stone-50/60 border border-stone-300 rounded-lg focus:bg-white focus:outline-none focus:border-[#0F3D2E]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-stone-400 hover:text-stone-700 cursor-pointer"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 rounded-lg text-sm font-semibold text-white bg-[#0F3D2E] hover:bg-[#14533E] disabled:opacity-50 shadow-sm transition-all cursor-pointer"
              >
                {loading ? "Creating Account..." : "Create Account & Continue"}
              </button>
            </form>
            )}
          </div>

          <p className="text-center text-[11px] text-stone-400">
            AM Jewellery ERP • Authorized Workshop Staff Only
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#FAF8F4] text-xs text-stone-500">
          Loading sign-in...
        </div>
      }
    >
      <LoginFormContent />
    </Suspense>
  );
}
