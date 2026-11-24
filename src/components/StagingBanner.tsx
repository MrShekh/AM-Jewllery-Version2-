"use client";

import React from "react";

export function StagingBanner() {
  const isStaging =
    process.env.NEXT_PUBLIC_APP_ENV === "staging" ||
    process.env.NEXT_PUBLIC_APP_ENV === "test";

  if (!isStaging) return null;

  return (
    <div className="no-print hide-on-print bg-amber-400 text-amber-950 border-b border-amber-500 px-4 py-1 text-center text-xs font-extrabold tracking-wide uppercase">
      TEST ENVIRONMENT — DUMMY DATA • External WhatsApp/SMS/Email Disabled
    </div>
  );
}
