"use client";

import React, { useCallback, useEffect, useState } from "react";
import { AppShell, AppShellUser } from "@/components/AppShell";
import {
  fetchActorCached,
  fetchCachedJson,
  getCachedActor,
} from "@/lib/client-cache";
import { Plus, Upload, RefreshCw, Search, CheckCircle2 } from "lucide-react";

interface CatalogueItem {
  id: string;
  code: string;
  name: string;
  categoryId: string;
  categoryName: string;
  thumbnailUrl: string | null;
  photos: string[];
  approxWeightMin: string | null;
  approxWeightMax: string | null;
  supportedSizes: string[];
  supportedPurityIds: string[];
  description: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
}

interface CategoryOption {
  id: string;
  code: string;
  name: string;
}

interface PurityOption {
  id: string;
  code: string;
  displayLabel: string;
  touchPercent: string;
}

export default function CatalogueManagerPage() {
  const [actor, setActor] = useState<AppShellUser | null>(null);
  const [items, setItems] = useState<CatalogueItem[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [purities, setPurities] = useState<PurityOption[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState<
    "ALL" | "DRAFT" | "PUBLISHED" | "ARCHIVED"
  >("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Create / Edit Design modal
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [approxWeightMin, setApproxWeightMin] = useState("");
  const [approxWeightMax, setApproxWeightMax] = useState("");
  const [sizesText, setSizesText] = useState("");
  const [selectedPurityIds, setSelectedPurityIds] = useState<string[]>([]);
  const [photos, setPhotos] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [designStatus, setDesignStatus] = useState<
    "DRAFT" | "PUBLISHED" | "ARCHIVED"
  >("PUBLISHED");
  const [saving, setSaving] = useState(false);

  // Add Category
  const [newCategoryName, setNewCategoryName] = useState("");

  // CSV Bulk Import
  const [showImport, setShowImport] = useState(false);
  const [csvText, setCsvText] = useState(
    "code,name,category,approxWeightMin,approxWeightMax,sizes,purities,description\nLR-101,Classic Solitaire Ring,Ladies Ring,3.200,4.500,12|14|16,22K / 92%|18K / 75%,Lightweight daily wear ring"
  );
  const [importPreview, setImportPreview] = useState<{
    validCount: number;
    errorCount: number;
    rows: Array<{
      rowNumber: number;
      code: string;
      name: string;
      valid: boolean;
      errors: string[];
    }>;
  } | null>(null);

  const loadCatalogue = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        page: String(page),
        pageSize: "24",
        status: statusFilter,
      });
      if (search.trim()) qs.set("search", search.trim());
      if (categoryFilter !== "ALL") qs.set("categoryId", categoryFilter);

      const [u, data] = await Promise.all([
        fetchActorCached(false),
        fetchCachedJson<{
          ok?: boolean;
          items?: CatalogueItem[];
          categories?: CategoryOption[];
          purities?: PurityOption[];
          total?: number;
          totalPages?: number;
          error?: string;
        }>(`/api/catalogue?${qs.toString()}`, { force: true }),
      ]);
      if (u) setActor(u);
      if (data.error) throw new Error(data.error);
      setItems(data.items || []);
      setCategories(data.categories || []);
      setPurities(data.purities || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
      if (!categoryId && data.categories?.[0]) {
        setCategoryId(data.categories[0].id);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load catalogue");
    } finally {
      setLoading(false);
    }
  }, [page, search, categoryFilter, statusFilter, categoryId]);

  useEffect(() => {
    void loadCatalogue();
  }, [loadCatalogue]);

  async function handlePhotoUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    const uploaded: string[] = [];
    for (const file of Array.from(files)) {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", "IMAGE");
      fd.append("scope", "PUBLIC_CATALOGUE");
      const res = await fetch("/api/app-attachments", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || `Failed to upload ${file.name}`);
        return;
      }
      uploaded.push(data.attachment.url);
    }
    setPhotos((prev) => [...prev, ...uploaded]);
  }

  async function handleSaveDesign(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/catalogue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "UPSERT_DESIGN",
          id: editingId,
          code,
          name,
          categoryId,
          approxWeightMin,
          approxWeightMax,
          supportedSizes: sizesText
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          supportedPurityIds: selectedPurityIds,
          photos,
          description,
          status: designStatus,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Failed to save design");
      }
      setMessage(`Saved design ${data.design.code} (${data.design.status}).`);
      setShowForm(false);
      setEditingId(null);
      setCode("");
      setName("");
      setApproxWeightMin("");
      setApproxWeightMax("");
      setSizesText("");
      setSelectedPurityIds([]);
      setPhotos([]);
      setDescription("");
      await loadCatalogue();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save design");
    } finally {
      setSaving(false);
    }
  }

  function parseCsvText(raw: string) {
    const lines = raw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length < 2) return [];
    const headers = lines[0].split(",").map((h) => h.trim());
    return lines.slice(1).map((line) => {
      const cols = line.split(",").map((c) => c.trim());
      const row: Record<string, string> = {};
      headers.forEach((h, i) => {
        row[h] = cols[i] ?? "";
      });
      return row;
    });
  }

  async function handleCsvImport(commit: boolean) {
    setError(null);
    setMessage(null);
    const rows = parseCsvText(csvText);
    const res = await fetch("/api/catalogue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "BULK_IMPORT",
        rows,
        commit,
        publishImmediately: false,
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      setError(data.error || "CSV import failed");
      return;
    }
    setImportPreview(data);
    if (commit) {
      setMessage(
        `Imported ${data.createdCount} draft designs (${data.errorCount} row errors). Review and publish when ready.`
      );
      await loadCatalogue();
    }
  }

  if (!actor) return <div className="p-6 text-xs text-slate-500">Loading...</div>;

  return (
    <AppShell actor={actor}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-slate-900">
              Design Catalogue ({total.toLocaleString()} designs)
            </h1>
            <p className="text-xs text-slate-500">
              Server-indexed catalogue supporting 30,000+ designs. Approximate weights are for customer reference only (not stock).
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setEditingId(null);
                setShowForm((v) => !v);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white rounded-md text-xs font-semibold cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              New Design
            </button>
            <button
              type="button"
              onClick={() => setShowImport((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 text-slate-700 rounded-md text-xs font-semibold cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              Bulk CSV Import
            </button>
            <button
              type="button"
              onClick={async () => {
                const res = await fetch("/api/catalogue", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "PUBLISH_ALL_DRAFTS" }),
                });
                const d = await res.json();
                if (d.ok) {
                  setMessage(`Published ${d.publishedCount} draft designs.`);
                  await loadCatalogue();
                }
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 text-white rounded-md text-xs font-semibold cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Publish Drafts
            </button>
          </div>
        </div>

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

        {/* New / Edit Design Form */}
        {showForm && (
          <form
            onSubmit={handleSaveDesign}
            className="bg-white border border-slate-200 rounded-lg p-4 space-y-3"
          >
            <div className="text-xs font-bold uppercase text-slate-700">
              {editingId ? "Edit Design" : "Add Catalogue Design"}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-600 mb-1">
                  Design Code *
                </label>
                <input
                  type="text"
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="LR-101"
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono uppercase"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-600 mb-1">
                  Design Name *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Solitaire Ring"
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-600 mb-1">
                  Category *
                </label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-600 mb-1">
                  Status
                </label>
                <select
                  value={designStatus}
                  onChange={(e) =>
                    setDesignStatus(
                      e.target.value as "DRAFT" | "PUBLISHED" | "ARCHIVED"
                    )
                  }
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white"
                >
                  <option value="DRAFT">Draft</option>
                  <option value="PUBLISHED">Published</option>
                  <option value="ARCHIVED">Archived</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-600 mb-1">
                  Approx Weight Min (g)
                </label>
                <input
                  type="number"
                  step="0.001"
                  value={approxWeightMin}
                  onChange={(e) => setApproxWeightMin(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-600 mb-1">
                  Approx Weight Max (g)
                </label>
                <input
                  type="number"
                  step="0.001"
                  value={approxWeightMax}
                  onChange={(e) => setApproxWeightMax(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-600 mb-1">
                  Supported Sizes (comma-separated)
                </label>
                <input
                  type="text"
                  value={sizesText}
                  onChange={(e) => setSizesText(e.target.value)}
                  placeholder="12, 14, 16"
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-600 mb-1">
                  Reference Photos (Bulk Multi-Select)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => void handlePhotoUpload(e.target.files)}
                  className="w-full text-xs"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2 text-xs">
              <span className="font-semibold text-slate-600 self-center">
                Supported Purities:
              </span>
              {purities.map((p) => {
                const active = selectedPurityIds.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() =>
                      setSelectedPurityIds((prev) =>
                        active ? prev.filter((x) => x !== p.id) : [...prev, p.id]
                      )
                    }
                    className={`px-2 py-1 rounded border cursor-pointer ${
                      active
                        ? "bg-slate-900 text-white border-slate-900"
                        : "bg-white text-slate-700 border-slate-300"
                    }`}
                  >
                    {p.displayLabel}
                  </button>
                );
              })}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Short Description
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-3 py-1.5 text-xs border border-slate-300 rounded bg-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-1.5 text-xs font-semibold bg-slate-900 text-white rounded cursor-pointer"
              >
                {saving ? "Saving..." : "Save Design"}
              </button>
            </div>
          </form>
        )}

        {/* CSV Import Panel */}
        {showImport && (
          <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3 text-xs">
            <div className="font-bold uppercase text-slate-700">
              Bulk CSV Metadata Import (Imported as Draft for Review)
            </div>
            <textarea
              rows={5}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              className="w-full font-mono text-xs p-2 border border-slate-300 rounded"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void handleCsvImport(false)}
                className="px-3 py-1.5 bg-white border border-slate-300 rounded font-semibold cursor-pointer"
              >
                Validate Rows
              </button>
              <button
                type="button"
                onClick={() => void handleCsvImport(true)}
                className="px-3 py-1.5 bg-slate-900 text-white rounded font-semibold cursor-pointer"
              >
                Import Valid Rows as Draft
              </button>
            </div>
            {importPreview && (
              <div className="border-t pt-2 space-y-1">
                <div>
                  Valid: <strong>{importPreview.validCount}</strong> • Errors:{" "}
                  <strong className="text-red-700">
                    {importPreview.errorCount}
                  </strong>
                </div>
                {importPreview.rows
                  .filter((r) => !r.valid)
                  .map((r) => (
                    <div key={r.rowNumber} className="text-red-700">
                      Row {r.rowNumber} ({r.code || "?"}): {r.errors.join("; ")}
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}

        {/* Filters & Add Category */}
        <div className="bg-white border border-slate-200 rounded-lg p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setPage(1);
                  setSearch(e.target.value);
                }}
                placeholder="Search code or name..."
                className="pl-8 pr-2.5 py-1.5 border border-slate-300 rounded w-56"
              />
            </div>
            <select
              value={categoryFilter}
              onChange={(e) => {
                setPage(1);
                setCategoryFilter(e.target.value);
              }}
              className="px-2.5 py-1.5 border border-slate-300 rounded bg-white"
            >
              <option value="ALL">All Categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => {
                setPage(1);
                setStatusFilter(
                  e.target.value as "ALL" | "DRAFT" | "PUBLISHED" | "ARCHIVED"
                );
              }}
              className="px-2.5 py-1.5 border border-slate-300 rounded bg-white"
            >
              <option value="ALL">All Statuses</option>
              <option value="PUBLISHED">Published</option>
              <option value="DRAFT">Draft</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="New category..."
              className="px-2 py-1 border border-slate-300 rounded w-36"
            />
            <button
              type="button"
              onClick={async () => {
                if (!newCategoryName.trim()) return;
                const res = await fetch("/api/catalogue", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    action: "CREATE_CATEGORY",
                    name: newCategoryName,
                  }),
                });
                const d = await res.json();
                if (d.ok) {
                  setNewCategoryName("");
                  await loadCatalogue();
                }
              }}
              className="px-2.5 py-1 bg-slate-100 border border-slate-300 rounded font-semibold cursor-pointer"
            >
              + Category
            </button>
            <button
              type="button"
              onClick={() => void loadCatalogue()}
              className="p-1.5 border border-slate-300 rounded bg-white cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {items.map((d) => (
            <div
              key={d.id}
              className="bg-white border border-slate-200 rounded-lg overflow-hidden flex flex-col"
            >
              <div className="h-36 bg-slate-100 flex items-center justify-center overflow-hidden">
                {d.thumbnailUrl ? (
                  <img
                    src={d.thumbnailUrl}
                    alt={d.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-xs text-slate-400">No Photo</span>
                )}
              </div>
              <div className="p-3 space-y-1.5 flex-1 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono font-bold text-slate-900">
                    {d.code}
                  </span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      d.status === "PUBLISHED"
                        ? "bg-emerald-100 text-emerald-800"
                        : d.status === "DRAFT"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-slate-200 text-slate-700"
                    }`}
                  >
                    {d.status}
                  </span>
                </div>
                <div className="font-semibold text-slate-800">{d.name}</div>
                <div className="text-slate-500">{d.categoryName}</div>
                {(d.approxWeightMin || d.approxWeightMax) && (
                  <div className="font-mono text-slate-700">
                    Approx: {d.approxWeightMin || "?"}–{d.approxWeightMax || "?"} g
                  </div>
                )}
                <div className="flex gap-1.5 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(d.id);
                      setCode(d.code);
                      setName(d.name);
                      setCategoryId(d.categoryId);
                      setApproxWeightMin(d.approxWeightMin || "");
                      setApproxWeightMax(d.approxWeightMax || "");
                      setSizesText(d.supportedSizes.join(", "));
                      setSelectedPurityIds(d.supportedPurityIds);
                      setPhotos(d.photos);
                      setDescription(d.description);
                      setDesignStatus(d.status);
                      setShowForm(true);
                    }}
                    className="flex-1 py-1 border border-slate-300 rounded font-semibold hover:bg-slate-50 cursor-pointer"
                  >
                    Edit
                  </button>
                  {d.status !== "PUBLISHED" && (
                    <button
                      type="button"
                      onClick={async () => {
                        await fetch("/api/catalogue", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            action: "SET_STATUS",
                            id: d.id,
                            status: "PUBLISHED",
                          }),
                        });
                        await loadCatalogue();
                      }}
                      className="px-2.5 py-1 bg-emerald-700 text-white rounded font-semibold cursor-pointer"
                    >
                      Publish
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between text-xs bg-white border border-slate-200 rounded-lg px-4 py-2">
            <span>
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1 border border-slate-300 rounded disabled:opacity-50 cursor-pointer"
              >
                Prev
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-3 py-1 border border-slate-300 rounded disabled:opacity-50 cursor-pointer"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
