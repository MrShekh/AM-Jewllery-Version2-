import { NextResponse } from "next/server";
import { ErpError } from "./domain/errors";

export function handleApiError(err: unknown) {
  if (err instanceof ErpError) {
    return NextResponse.json(
      {
        ok: false,
        error: err.message,
        code: err.code,
      },
      { status: err.statusCode }
    );
  }
  const message =
    err instanceof Error ? err.message : "An unexpected server error occurred";
  console.error("[V2 API Error]", err);
  return NextResponse.json(
    {
      ok: false,
      error: message,
      code: "INTERNAL_ERROR",
    },
    { status: 500 }
  );
}

