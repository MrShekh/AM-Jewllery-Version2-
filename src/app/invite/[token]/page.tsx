"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { StagingBanner } from "@/components/StagingBanner";

export default function AcceptInvitePage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const token = String(params?.token || "");

  const [loading, setLoading] = useState(true);
  const [alreadyAccepted, setAlreadyAccepted] = useState(false);
  const [invite, setInvite] = useState<{
    email: string;
    displayName: string;
    role: string;
    organizationName: string;
    customerName: string | null;
    customerCode: string | null;
  } | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/invitations?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.ok || !d.invite) {
          setError(d.error || "Invalid or expired invitation link");
        } else {
          setAlreadyAccepted(Boolean(d.alreadyAccepted));
          setInvite(d.invite);
          setDisplayName(d.invite.displayName || "");
        }
      })
      .catch(() => setError("Failed to verify invitation"))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleAccept(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "ACCEPT_INVITE",
          token,
          displayName,
          password,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || "Could not activate account");
        return;
      }
      router.push("/login");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <StagingBanner />
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
          <h1 className="text-lg font-bold text-slate-900">
            Activate Your AM Jewellery Account
          </h1>
          {loading ? (
            <p className="text-xs text-slate-500">Verifying invitation...</p>
          ) : error && !invite ? (
            <div className="p-3 rounded bg-red-50 border border-red-200 text-xs text-red-700">
              {error}
            </div>
          ) : alreadyAccepted && invite ? (
            <div className="space-y-4">
              <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 space-y-1.5">
                <div className="font-bold text-sm">Your account is already activated!</div>
                <div>
                  You have already set your password for{" "}
                  <strong>{invite.customerName || invite.displayName}</strong>.
                </div>
                <div className="break-all">
                  Login with your <strong>phone number</strong> or{" "}
                  <strong className="font-mono">{invite.email}</strong>.
                </div>
              </div>
              <button
                type="button"
                onClick={() => router.push(`/login?email=${encodeURIComponent(invite.email)}`)}
                className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-md cursor-pointer"
              >
                Continue to Login →
              </button>
            </div>
          ) : invite ? (
            <form onSubmit={handleAccept} className="space-y-3">
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1 overflow-hidden">
                <div>
                  <span className="text-slate-500">Business:</span>{" "}
                  <strong>{invite.organizationName}</strong>
                </div>
                <div>
                  <span className="text-slate-500">Role:</span>{" "}
                  <strong className="font-mono">{invite.role}</strong>
                </div>
                <div className="break-all">
                  <span className="text-slate-500">Email:</span>{" "}
                  <strong className="font-mono break-all">{invite.email}</strong>
                </div>
                {invite.customerName && (
                  <div className="break-words">
                    <span className="text-slate-500">Linked Customer:</span>{" "}
                    <strong>
                      {invite.customerName} ({invite.customerCode})
                    </strong>
                  </div>
                )}
              </div>

              {error && (
                <div className="p-2.5 rounded bg-red-50 border border-red-200 text-xs text-red-700">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Display Name
                </label>
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Set Password (min 6 characters)
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3 py-2 pr-10 text-sm border border-slate-300 rounded-md"
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute inset-y-0 right-0 px-3 flex items-center text-slate-500 hover:text-slate-800 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Confirm Password
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    required
                    minLength={6}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-3 py-2 pr-10 text-sm border border-slate-300 rounded-md"
                  />
                  <button
                    type="button"
                    aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    className="absolute inset-y-0 right-0 px-3 flex items-center text-slate-500 hover:text-slate-800 cursor-pointer"
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-md cursor-pointer"
              >
                {submitting ? "Activating..." : "Set Password & Continue to Login"}
              </button>
            </form>
          ) : null}
        </div>
      </div>
    </div>
  );
}
