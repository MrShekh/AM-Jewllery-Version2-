"use client";

import React, { useRef, useState } from "react";
import { Mic, Square, RotateCcw, Upload, Check } from "lucide-react";

export function VoiceRecorderInput({
  attachmentId,
  onUploaded,
}: {
  attachmentId: string | null;
  onUploaded: (attachmentId: string | null) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function uploadAudioBlob(blob: Blob, filename: string) {
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", new File([blob], filename, { type: blob.type || "audio/webm" }));
      fd.append("kind", "VOICE_NOTE");
      fd.append("scope", "PRIVATE");
      const res = await fetch("/api/app-attachments", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Voice upload failed");
      }
      onUploaded(data.attachment.id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Voice upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function startRecording() {
    setError(null);
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      setError("Microphone recording not supported in this browser. Please upload an audio file instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredMime =
        typeof MediaRecorder !== "undefined" && typeof MediaRecorder.isTypeSupported === "function"
          ? ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((m) =>
              MediaRecorder.isTypeSupported(m)
            )
          : undefined;
      const recorder = preferredMime
        ? new MediaRecorder(stream, { mimeType: preferredMime })
        : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const mime = recorder.mimeType || preferredMime || "audio/webm";
        const ext = mime.includes("mp4") ? "m4a" : mime.includes("ogg") ? "ogg" : "webm";
        const blob = new Blob(chunksRef.current, { type: mime });
        const preview = URL.createObjectURL(blob);
        setLocalUrl(preview);
        void uploadAudioBlob(blob, `voice_${Date.now()}.${ext}`);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch (err: unknown) {
      const errName = err instanceof Error ? err.name : "";
      if (errName === "NotAllowedError" || errName === "PermissionDeniedError") {
        setError(
          "Microphone permission is blocked. On Android: open Chrome → ⋮ → Settings → Site settings → Microphone (allow this site), and check Phone Settings → Apps → Chrome → Permissions → Microphone. Or use Upload Audio File."
        );
      } else {
        setError(
          "Microphone unavailable in this app view. Tap 'Upload Audio File' or open in Chrome to record."
        );
      }
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  }

  return (
    <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-md space-y-2 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold text-slate-700">
          Optional Voice Note
        </span>
        {attachmentId && (
          <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
            <Check className="w-3.5 h-3.5" />
            Uploaded
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {!recording ? (
          <button
            type="button"
            onClick={() => void startRecording()}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-900 text-white rounded font-medium cursor-pointer"
          >
            <Mic className="w-3.5 h-3.5" />
            {localUrl || attachmentId ? "Re-record" : "Record Voice"}
          </button>
        ) : (
          <button
            type="button"
            onClick={stopRecording}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-red-600 text-white rounded font-medium cursor-pointer"
          >
            <Square className="w-3.5 h-3.5" />
            Stop Recording
          </button>
        )}

        <label className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white border border-slate-300 text-slate-700 rounded font-medium cursor-pointer hover:bg-slate-50">
          <Upload className="w-3.5 h-3.5" />
          <span>Upload Audio File</span>
          <input
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setLocalUrl(URL.createObjectURL(file));
              void uploadAudioBlob(file, file.name);
            }}
          />
        </label>

        {(localUrl || attachmentId) && (
          <button
            type="button"
            onClick={() => {
              setLocalUrl(null);
              onUploaded(null);
            }}
            className="inline-flex items-center gap-1 px-2 py-1 text-slate-500 hover:text-slate-800 cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            Clear
          </button>
        )}
      </div>

      {uploading && (
        <div className="text-[11px] text-blue-700">Uploading voice note...</div>
      )}
      {error && <div className="text-[11px] text-amber-800">{error}</div>}
      {(localUrl || attachmentId) && (
        <audio
          controls
          src={localUrl || (attachmentId ? `/api/app-attachments/${attachmentId}` : undefined)}
          className="w-full h-8"
        />
      )}
    </div>
  );
}
