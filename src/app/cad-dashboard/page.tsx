"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { StagingBanner } from "@/components/StagingBanner";
import {
  clearAllClientCache,
  fetchActorCached,
  getCachedActor,
} from "@/lib/client-cache";
import { CheckCircle2, LogOut, MessageSquare, Play, Bell } from "lucide-react";

type CadTab = "TO_START" | "IN_PROGRESS" | "CHANGES_REQUIRED" | "CAD_READY";

interface CadJob {
  id: string;
  orderId: string;
  bagNumber: string;
  orderName: string;
  photoUrl: string | null;
  size: string | null;
  targetWeight: string | null;
  purityLabel: string;
  status: CadTab;
  cadDeadline: string | null;
  currentVersion: number;
  acknowledgedVersion: number;
  hasNewInstruction: boolean;
  completedVersion: number | null;
  completedAt: string | null;
  instructions: string;
  selectedMedia: Array<{
    id: string;
    kind: "IMAGE" | "VOICE_NOTE";
    originalName: string;
  }>;
}

export default function CadDesignerDashboardPage() {
  const router = useRouter();
  const [actor, setActor] = useState<ReturnType<typeof getCachedActor>>(null);
  const [tab, setTab] = useState<CadTab>("TO_START");
  const [jobs, setJobs] = useState<CadJob[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [questionById, setQuestionById] = useState<Record<string, string>>({});

  const loadJobs = useCallback(async () => {
    const resolved = await fetchActorCached(false);
    if (!resolved) {
      router.push("/login?redirect=/cad-dashboard");
      return;
    }
    if (resolved.role !== "CAD_DESIGNER") {
      router.push(
        resolved.role === "CUSTOMER" ? "/customer-app" : "/production-register"
      );
      return;
    }
    setActor(resolved);

    const res = await fetch("/api/cad", { cache: "no-store" });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      setError(data.error || "Failed to load CAD jobs");
      setLoading(false);
      return;
    }
    setJobs(data.jobs || []);
    setUnreadCount(data.unreadCount || 0);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  async function runAction(
    job: CadJob,
    action: "START_WORK" | "ACKNOWLEDGE" | "ASK_MANAGER" | "MARK_CAD_READY"
  ) {
    setError(null);
    setMessage(null);
    const res = await fetch("/api/cad", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assignmentId: job.id,
        action,
        expectedVersion: job.currentVersion,
        questionNote: questionById[job.id] || "",
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      setError(data.error || "Action failed");
      return;
    }
    if (action === "ASK_MANAGER") {
      setQuestionById((prev) => ({ ...prev, [job.id]: "" }));
    }
    setMessage(
      action === "MARK_CAD_READY"
        ? `Bag #${job.bagNumber} marked CAD Ready (no file upload required). Manager notified.`
        : `Updated Bag #${job.bagNumber}.`
    );
    await loadJobs();
  }

  async function handleLogout() {
    clearAllClientCache();
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  if (loading || !actor) {
    return <div className="p-6 text-xs text-slate-500">Loading CAD Dashboard...</div>;
  }

  const counts = {
    TO_START: jobs.filter((j) => j.status === "TO_START").length,
    IN_PROGRESS: jobs.filter((j) => j.status === "IN_PROGRESS").length,
    CHANGES_REQUIRED: jobs.filter((j) => j.status === "CHANGES_REQUIRED").length,
    CAD_READY: jobs.filter((j) => j.status === "CAD_READY").length,
  };
  const visibleJobs = jobs.filter((j) => j.status === tab);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <StagingBanner />
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div>
            <div className="font-bold text-sm text-slate-900">
              AM Jewellery — CAD Designer Workspace
            </div>
            <div className="text-xs text-slate-500">
              Designer: <strong>{actor.displayName}</strong>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-100 text-xs font-semibold text-slate-700">
              <Bell className="w-3.5 h-3.5" />
              {unreadCount} unread
            </span>
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="inline-flex items-center gap-1 px-3 py-1.5 border border-slate-300 rounded text-xs font-semibold text-slate-700 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl w-full mx-auto px-4 py-5 space-y-4">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded text-xs text-red-700">
            {error}
          </div>
        )}
        {message && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded text-xs text-emerald-800">
            {message}
          </div>
        )}

        <div className="flex flex-wrap gap-2 bg-white border border-slate-200 rounded-lg p-2 text-xs">
          {(
            [
              ["TO_START", `To Start (${counts.TO_START})`],
              ["IN_PROGRESS", `In Progress (${counts.IN_PROGRESS})`],
              ["CHANGES_REQUIRED", `Changes Required (${counts.CHANGES_REQUIRED})`],
              ["CAD_READY", `CAD Ready (${counts.CAD_READY})`],
            ] as const
          ).map(([k, lbl]) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={`px-3 py-1.5 rounded font-semibold cursor-pointer ${
                tab === k
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>

        {visibleJobs.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-lg p-8 text-center text-xs text-slate-500">
            No CAD tasks in {tab.replace(/_/g, " ")}.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {visibleJobs.map((job) => (
              <div
                key={job.id}
                className="bg-white border border-slate-200 rounded-lg p-4 space-y-3 text-xs"
              >
                <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-sm text-slate-900">
                        Bag #{job.bagNumber}
                      </span>
                      {job.hasNewInstruction && (
                        <span className="px-2 py-0.5 bg-amber-100 text-amber-900 rounded font-bold text-[10px]">
                          New Instruction v{job.currentVersion}
                        </span>
                      )}
                    </div>
                    <div className="font-semibold text-slate-800 mt-0.5">
                      {job.orderName}
                    </div>
                  </div>
                  <div className="text-right font-mono text-slate-600">
                    <div>CAD Deadline</div>
                    <strong className="text-slate-900">
                      {job.cadDeadline || "—"}
                    </strong>
                  </div>
                </div>

                {job.photoUrl && (
                  <img
                    src={job.photoUrl}
                    alt={job.orderName}
                    className="w-full h-40 object-contain bg-slate-50 rounded border border-slate-200"
                  />
                )}

                <div className="grid grid-cols-3 gap-2 bg-slate-50 p-2 rounded border border-slate-200">
                  <div>
                    Purity: <strong>{job.purityLabel}</strong>
                  </div>
                  <div>
                    Size: <strong>{job.size || "—"}</strong>
                  </div>
                  <div>
                    Target: <strong>{job.targetWeight || "—"}g</strong>
                  </div>
                </div>

                <div className="p-2.5 bg-blue-50/50 border border-blue-200 rounded space-y-1">
                  <div className="font-bold text-blue-950">
                    Manager Instructions (v{job.currentVersion}):
                  </div>
                  <div className="text-slate-800 whitespace-pre-wrap">
                    {job.instructions || "No additional text instructions."}
                  </div>
                </div>

                {job.selectedMedia.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="font-semibold text-slate-700">
                      Shared References:
                    </div>
                    {job.selectedMedia.map((m) =>
                      m.kind === "VOICE_NOTE" ? (
                        <audio
                          key={m.id}
                          controls
                          src={`/api/app-attachments/${m.id}`}
                          className="w-full h-8"
                        />
                      ) : (
                        <img
                          key={m.id}
                          src={`/api/app-attachments/${m.id}`}
                          alt={m.originalName}
                          className="h-24 rounded border border-slate-200 object-contain"
                        />
                      )
                    )}
                  </div>
                )}

                <div className="flex flex-wrap gap-2 pt-1">
                  {job.status === "TO_START" && (
                    <button
                      type="button"
                      onClick={() => void runAction(job, "START_WORK")}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-700 text-white rounded font-semibold cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5" />
                      Start Work
                    </button>
                  )}
                  {job.hasNewInstruction && (
                    <button
                      type="button"
                      onClick={() => void runAction(job, "ACKNOWLEDGE")}
                      className="px-3 py-1.5 bg-amber-600 text-white rounded font-semibold cursor-pointer"
                    >
                      Acknowledge v{job.currentVersion}
                    </button>
                  )}
                  {job.status !== "CAD_READY" && (
                    <button
                      type="button"
                      onClick={() => void runAction(job, "MARK_CAD_READY")}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-700 text-white rounded font-semibold cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Mark CAD Ready
                    </button>
                  )}
                </div>

                <div className="flex gap-2 pt-2 border-t border-slate-100">
                  <input
                    type="text"
                    value={questionById[job.id] || ""}
                    onChange={(e) =>
                      setQuestionById((prev) => ({
                        ...prev,
                        [job.id]: e.target.value,
                      }))
                    }
                    placeholder="Ask manager a question..."
                    className="flex-1 px-2.5 py-1.5 border border-slate-300 rounded"
                  />
                  <button
                    type="button"
                    onClick={() => void runAction(job, "ASK_MANAGER")}
                    className="inline-flex items-center gap-1 px-3 py-1.5 border border-slate-300 rounded font-semibold cursor-pointer"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    Ask Manager
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
