"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { StagingBanner } from "@/components/StagingBanner";
import { VoiceRecorderInput } from "@/components/customer-app/VoiceRecorderInput";
import {
  clearAllClientCache,
  fetchActorCached,
  getCachedActor,
} from "@/lib/client-cache";
import {
  ShoppingBag,
  ShoppingCart,
  Bell,
  FileText,
  LogOut,
  Plus,
  Trash2,
  Send,
  Search,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  X,
  User,
  ImagePlus,
  Sparkles,
  Upload,
  Heart,
  MapPin,
  Phone,
  Pencil,
  Camera,
  MoreVertical,
  RotateCcw,
  CheckCircle2,
} from "lucide-react";

type CustomerTab = "DESIGNS" | "CUSTOM" | "CART" | "ORDERS" | "NOTIFICATIONS" | "PROFILE";

// Toggle to false once the client's real jewellery catalogue is uploaded
const CATALOGUE_UPDATING_SOON = true;

const HERO_SHOWCASE_SLIDES = [
  {
    id: "hero-5",
    categoryName: "Bridal & Wedding Rings",
    name: "Solitaire & Wedding Band Collection",
    description:
      "Timeless 22K & 18K wedding rings crafted for unforgettable moments.",
    thumbnailUrl: "/showcase/hero-5.jpg",
    bgGradient: "from-[#3D2B1F] via-[#5A3E2B] to-[#7A573B]",
  },
  {
    id: "hero-6",
    categoryName: "Men's Gold Collection",
    name: "Signature Men's Chains & Bracelets",
    description:
      "Solid 22K Cuban link bracelets and bold handcrafted chains.",
    thumbnailUrl: "/showcase/hero-6.jpg",
    bgGradient: "from-[#111827] via-[#1F2937] to-[#334155]",
  },
  {
    id: "hero-1",
    categoryName: "Cocktail & Statement Rings",
    name: "Royal Pavé Diamond Rings",
    description:
      "Intricate rose-gold & diamond settings with hallmarked finish.",
    thumbnailUrl: "/showcase/hero-1.jpg",
    bgGradient: "from-[#4A0E1C] via-[#6B1426] to-[#881B33]",
  },
  {
    id: "hero-2",
    categoryName: "Necklaces & Sets",
    name: "Minimalist Gold & Pearl Sets",
    description:
      "Everyday elegance in 22K yellow gold with matching earrings.",
    thumbnailUrl: "/showcase/hero-2.jpg",
    bgGradient: "from-[#0F3D3E] via-[#165354] to-[#1E6B6B]",
  },
  {
    id: "hero-4",
    categoryName: "Earrings & Studs",
    name: "Sculpted Gold & Diamond Studs",
    description:
      "Precision-crafted swirl studs designed for comfort and brilliance.",
    thumbnailUrl: "/showcase/hero-4.jpg",
    bgGradient: "from-[#3E2E20] via-[#59432F] to-[#73563D]",
  },
  {
    id: "hero-3",
    categoryName: "Modern Classics",
    name: "Geometric Rose-Gold Rings",
    description:
      "Contemporary silhouettes tailored to your exact weight and size.",
    thumbnailUrl: "/showcase/hero-3.jpg",
    bgGradient: "from-[#0F3D2E] via-[#134E3A] to-[#1B5E46]",
  },
];

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
}

interface CartItem {
  localId: string;
  sourceType: "CATALOGUE" | "CUSTOM";
  designId?: string | null;
  code: string;
  name: string;
  thumbnailUrl?: string | null;
  quantity: number;
  size: string;
  purityId: string;
  customPurityLabel?: string;
  targetWeight: string;
  requestedChanges: string;
  textInstructions: string;
  requestedItemDate: string;
  voiceAttachmentId: string | null;
  referenceMediaIds: string[];
}

export default function CustomerAppPage() {
  const router = useRouter();
  const [actor, setActor] = useState<ReturnType<typeof getCachedActor>>(null);
  const [tab, setTab] = useState<CustomerTab>("DESIGNS");
  const lastNonNotifTabRef = useRef<CustomerTab>("DESIGNS");
  useEffect(() => {
    if (tab !== "NOTIFICATIONS") {
      lastNonNotifTabRef.current = tab;
    }
  }, [tab]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Catalogue state
  const [designs, setDesigns] = useState<CatalogueItem[]>([]);
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [purities, setPurities] = useState<Array<{ id: string; displayLabel: string }>>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [purityFilter, setPurityFilter] = useState("ALL");
  const [sizeFilter, setSizeFilter] = useState("");
  const [minWeight, setMinWeight] = useState("");
  const [maxWeight, setMaxWeight] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [wishlistIds, setWishlistIds] = useState<string[]>([]);
  const [savedOnly, setSavedOnly] = useState(false);
  const [heroSlide, setHeroSlide] = useState(0);
  const [orderFilter, setOrderFilter] = useState<string>("ALL");
  const [previewOrderPhoto, setPreviewOrderPhoto] = useState<string | null>(null);
  const [orderSuccessNumber, setOrderSuccessNumber] = useState<string | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [profilePhone, setProfilePhone] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [profileAddress, setProfileAddress] = useState("");
  const [profileGst, setProfileGst] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingProfilePhoto, setUploadingProfilePhoto] = useState(false);

  // Amazon/Flipkart-style Product Detail Modal
  const [selectedDesign, setSelectedDesign] = useState<CatalogueItem | null>(null);
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [modalPurityId, setModalPurityId] = useState("");
  const [modalCustomPurity, setModalCustomPurity] = useState("");
  const [modalSize, setModalSize] = useState("");

  // Cart & Submission state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [expandedCartIds, setExpandedCartIds] = useState<Record<string, boolean>>({});
  const [requestedDeliveryDate, setRequestedDeliveryDate] = useState("");
  const [customerNote, setCustomerNote] = useState("");
  const [submittingOrder, setSubmittingOrder] = useState(false);

  // Dedicated Custom Design Upload state
  const [customTitle, setCustomTitle] = useState("");
  const [customPurityId, setCustomPurityId] = useState("");
  const [customPurityText, setCustomPurityText] = useState("");
  const [customWeight, setCustomWeight] = useState("");
  const [customSize, setCustomSize] = useState("");
  const [customQty, setCustomQty] = useState(1);
  const [customDate, setCustomDate] = useState("");
  const [customInstructions, setCustomInstructions] = useState("");
  const [customVoiceId, setCustomVoiceId] = useState<string | null>(null);
  const [customMediaIds, setCustomMediaIds] = useState<string[]>([]);
  const [uploadingCustomPhoto, setUploadingCustomPhoto] = useState(false);

  // Workspace state
  const [customer, setCustomer] = useState<{
    id: string;
    customerCode: string;
    name: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    profilePhotoUrl?: string | null;
  } | null>(null);
  const [requests, setRequests] = useState<
    Array<{
      id: string;
      requestNumber: string;
      status: string;
      statusLabel: string;
      requestedDeliveryDate: string | null;
      confirmedDeliveryDate: string | null;
      customerNote: string | null;
      managerVisibleNote: string | null;
      declineReason: string | null;
      submittedAt: string;
      items: Array<{
        id: string;
        sourceType?: "CATALOGUE" | "CUSTOM";
        designId?: string | null;
        purityId?: string | null;
        quantity: number;
        size: string | null;
        purityLabelSnapshot: string | null;
        targetWeight: string | null;
        requestedChanges: string | null;
        textInstructions: string | null;
        voiceAttachmentId: string | null;
        referenceMediaIds: string[];
        designSnapshot: {
          code?: string;
          name?: string;
          thumbnailUrl?: string | null;
        };
      }>;
      linkedBills?: Array<{
        id: string;
        billNumber: string;
        billDate: string;
        totalFineGold: string;
        totalCashRupees: string;
        settlementStatus: string;
        previewHtml: string | null;
      }>;
      messages: Array<{
        id: string;
        senderRole: string;
        senderName: string;
        messageType: string;
        body: string;
        createdAt: string;
      }>;
    }>
  >([]);
  const [bills, setBills] = useState<
    Array<{
      id: string;
      billNumber: string;
      billDate: string;
      totalFineGold: string;
      totalCashRupees: string;
      settlementStatus: string;
      previewHtml: string | null;
    }>
  >([]);
  const [notifications, setNotifications] = useState<
    Array<{
      id: string;
      title: string;
      body: string;
      isRead: boolean;
      createdAt: string;
    }>
  >([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [replyTextByReq, setReplyTextByReq] = useState<Record<string, string>>({});
  const [viewingBillHtml, setViewingBillHtml] = useState<string | null>(null);
  const [openOrderMenuId, setOpenOrderMenuId] = useState<string | null>(null);
  const [cancelModal, setCancelModal] = useState<{
    mode: "DELETE" | "REQUEST_CANCEL";
    requestId: string;
    requestNumber: string;
  } | null>(null);
  const [cancelReason, setCancelReason] = useState(
    "Ordered by mistake — please cancel"
  );
  const [submittingCancel, setSubmittingCancel] = useState(false);

  const orderPurities = useMemo(() => {
    const allowed: Array<{ id: string; displayLabel: string; rank: number }> = [];
    for (const p of purities) {
      const lbl = p.displayLabel || "";
      if (/75\.5/.test(lbl)) continue;
      if (/22\s*k|\b92\b/i.test(lbl)) {
        allowed.push({ id: p.id, displayLabel: "22K", rank: 1 });
      } else if (/20\s*k|\b84\b/i.test(lbl)) {
        allowed.push({ id: p.id, displayLabel: "20K", rank: 2 });
      } else if (/18\s*k|\b75\b/i.test(lbl)) {
        allowed.push({ id: p.id, displayLabel: "18K", rank: 3 });
      } else if (/9\s*k|37\.5/i.test(lbl)) {
        allowed.push({ id: p.id, displayLabel: "9K", rank: 4 });
      }
    }
    return allowed
      .sort((a, b) => a.rank - b.rank)
      .map(({ id, displayLabel }) => ({ id, displayLabel }));
  }, [purities]);

  const purityNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of purities) {
      const matched = orderPurities.find((op) => op.id === p.id);
      map.set(p.id, matched ? matched.displayLabel : p.displayLabel);
    }
    return map;
  }, [purities, orderPurities]);

  const loadWorkspace = useCallback(async () => {
    const resolved = await fetchActorCached(false);
    if (!resolved) {
      router.push("/login?redirect=/customer-app");
      return;
    }
    if (resolved.role !== "CUSTOMER") {
      router.push(
        resolved.role === "CAD_DESIGNER"
          ? "/cad-dashboard"
          : "/production-register"
      );
      return;
    }
    setActor(resolved);

    const res = await fetch("/api/customer-app", { cache: "no-store" });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      setError(data.error || "Failed to load customer portal");
      setLoading(false);
      return;
    }
    setCustomer(data.customer);
    if (data.customer) {
      setProfileName(data.customer.name || "");
      setProfilePhone(data.customer.phone || "");
      setProfileEmail(data.customer.email || "");
      setProfileAddress(data.customer.address || "");
      setProfileGst(data.customer.gstNumber || "");
    }
    setRequests(data.requests || []);
    setBills(data.bills || []);
    setNotifications(data.notifications || []);
    setUnreadCount(data.unreadCount || 0);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  const loadCatalogue = useCallback(async () => {
    const qs = new URLSearchParams({
      page: String(page),
      pageSize: "16",
    });
    if (debouncedSearch.trim()) qs.set("search", debouncedSearch.trim());
    if (categoryFilter !== "ALL") qs.set("categoryId", categoryFilter);
    if (purityFilter !== "ALL") qs.set("purityId", purityFilter);
    if (sizeFilter.trim()) qs.set("size", sizeFilter.trim());
    if (minWeight.trim()) qs.set("minWeight", minWeight.trim());
    if (maxWeight.trim()) qs.set("maxWeight", maxWeight.trim());

    const res = await fetch(`/api/catalogue?${qs.toString()}`, {
      cache: "no-store",
    });
    const data = await res.json();
    if (res.ok && data.ok) {
      setDesigns(data.items || []);
      setCategories(data.categories || []);
      setPurities(data.purities || []);
      setTotalPages(data.totalPages || 1);
    }
  }, [page, debouncedSearch, categoryFilter, purityFilter, sizeFilter, minWeight, maxWeight]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  useEffect(() => {
    void loadCatalogue();
  }, [loadCatalogue]);

  useEffect(() => {
    if (!actor?.userId || typeof window === "undefined") return;
    const raw = window.localStorage.getItem(`am_cust_cart_${actor.userId}`);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as CartItem[];
        if (Array.isArray(parsed)) setCart(parsed);
      } catch {
        // ignore
      }
    }
    const rawWish = window.localStorage.getItem(`am_cust_wish_${actor.userId}`);
    if (rawWish) {
      try {
        const parsed = JSON.parse(rawWish) as string[];
        if (Array.isArray(parsed)) setWishlistIds(parsed);
      } catch {
        // ignore
      }
    }
  }, [actor?.userId]);

  useEffect(() => {
    if (!actor?.userId || typeof window === "undefined") return;
    window.localStorage.setItem(
      `am_cust_wish_${actor.userId}`,
      JSON.stringify(wishlistIds)
    );
  }, [actor?.userId, wishlistIds]);

  function toggleWishlist(designId: string) {
    setWishlistIds((prev) =>
      prev.includes(designId)
        ? prev.filter((id) => id !== designId)
        : [...prev, designId]
    );
  }

  useEffect(() => {
    if (!actor?.userId || typeof window === "undefined") return;
    window.localStorage.setItem(
      `am_cust_cart_${actor.userId}`,
      JSON.stringify(cart)
    );
  }, [actor?.userId, cart]);

  function addCatalogueDesignToCart(
    d: CatalogueItem,
    chosenPurityId?: string,
    chosenSize?: string,
    chosenCustomPurity?: string
  ) {
    const newId = `ci_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const manualPurity = (chosenCustomPurity || "").trim();
    setCart((prev) => [
      ...prev,
      {
        localId: newId,
        sourceType: "CATALOGUE",
        designId: d.id,
        code: d.code,
        name: d.name,
        thumbnailUrl: d.thumbnailUrl || d.photos[0] || null,
        quantity: 1,
        size: chosenSize || d.supportedSizes[0] || "",
        purityId: chosenPurityId || d.supportedPurityIds[0] || orderPurities[0]?.id || "",
        targetWeight: d.approxWeightMin || "",
        requestedChanges: "",
        textInstructions: "",
        requestedItemDate: "",
        voiceAttachmentId: null,
        referenceMediaIds: [],
      },
    ]);
    setSelectedDesign(null);
    setMessage(`Added "${d.name}" to your order cart.`);
    setTab("CART");
  }

  function openCustomUploadTab() {
    if (!customPurityId && orderPurities[0]?.id) {
      setCustomPurityId(orderPurities[0].id);
    }
    setTab("CUSTOM");
  }

  async function uploadCustomDraftImages(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploadingCustomPhoto(true);
    setError(null);
    try {
      const uploadedIds: string[] = [];
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("kind", "IMAGE");
        fd.append("scope", "PRIVATE");
        const res = await fetch("/api/app-attachments", { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          setError(data.error || "Image upload failed");
        } else if (data.attachment?.id) {
          uploadedIds.push(data.attachment.id);
        }
      }
      if (uploadedIds.length > 0) {
        setCustomMediaIds((prev) => [...prev, ...uploadedIds]);
      }
    } finally {
      setUploadingCustomPhoto(false);
    }
  }

  function resetCustomDraft() {
    setCustomTitle("");
    setCustomPurityId(orderPurities[0]?.id || "");
    setCustomPurityText("");
    setCustomWeight("");
    setCustomSize("");
    setCustomQty(1);
    setCustomDate("");
    setCustomInstructions("");
    setCustomVoiceId(null);
    setCustomMediaIds([]);
  }

  function addCustomDraftToCart(e: React.FormEvent) {
    e.preventDefault();
    const title = customTitle.trim() || "Custom Jewellery Design";
    const newId = `ci_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setCart((prev) => [
      ...prev,
      {
        localId: newId,
        sourceType: "CUSTOM",
        designId: null,
        code: "CUSTOM",
        name: title,
        thumbnailUrl: customMediaIds[0] ? `/api/app-attachments/${customMediaIds[0]}` : null,
        quantity: Math.max(1, customQty),
        size: customSize.trim(),
        purityId: customPurityId || orderPurities[0]?.id || "",
        targetWeight: customWeight.trim(),
        requestedChanges: "",
        textInstructions: customInstructions.trim(),
        requestedItemDate: customDate,
        voiceAttachmentId: customVoiceId,
        referenceMediaIds: customMediaIds,
      },
    ]);
    resetCustomDraft();
    setMessage(`Added "${title}" to your cart.`);
    setTab("CART");
  }

  async function uploadItemReferenceImage(localId: string, file: File) {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("kind", "IMAGE");
    fd.append("scope", "PRIVATE");
    const res = await fetch("/api/app-attachments", { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      setError(data.error || "Image upload failed");
      return;
    }
    setCart((prev) =>
      prev.map((c) =>
        c.localId === localId
          ? { ...c, referenceMediaIds: [...c.referenceMediaIds, data.attachment.id] }
          : c
      )
    );
  }

  async function handleSubmitCart(e: React.FormEvent) {
    e.preventDefault();
    if (cart.length === 0 || submittingOrder) return;
    setSubmittingOrder(true);
    setError(null);
    setMessage(null);
    try {
      const idem = `creq_${actor?.userId}_${cart.map((c) => c.localId).join("_")}`;
      const res = await fetch("/api/customer-app", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "SUBMIT_REQUEST",
          requestedDeliveryDate: requestedDeliveryDate || null,
          customerNote,
          idempotencyKey: idem,
          items: cart.map((c) => ({
            sourceType: c.sourceType,
            designId: c.designId,
            customTitle: c.name,
            quantity: c.quantity,
            size: c.size,
            purityId: c.purityId,
            customPurityLabel: c.customPurityLabel,
            targetWeight: c.targetWeight || null,
            requestedChanges: c.requestedChanges,
            textInstructions: c.textInstructions,
            requestedItemDate: c.requestedItemDate || null,
            voiceAttachmentId: c.voiceAttachmentId,
            referenceMediaIds: c.referenceMediaIds,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Failed to submit order request");
      }
      setCart([]);
      setRequestedDeliveryDate("");
      setCustomerNote("");
      setOrderSuccessNumber(data.request.requestNumber);
      setTab("ORDERS");
      await loadWorkspace();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to submit request");
    } finally {
      setSubmittingOrder(false);
    }
  }

  async function uploadProfilePhoto(file: File) {
    if (!customer) return;
    setUploadingProfilePhoto(true);
    setError(null);
    setMessage(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", "IMAGE");
      fd.append("scope", "PUBLIC");
      const upRes = await fetch("/api/app-attachments", { method: "POST", body: fd });
      const upData = await upRes.json();
      if (!upRes.ok || !upData.ok || !upData.attachment?.id) {
        setError(upData.error || "Photo upload failed");
        return;
      }
      const photoUrl = `/api/app-attachments/${upData.attachment.id}`;
      const res = await fetch("/api/customer-app", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "UPDATE_PROFILE",
          name: customer.name,
          phone: customer.phone || "",
          email: customer.email || "",
          address: customer.address || "",
          profilePhotoUrl: photoUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || "Failed to save profile photo");
        return;
      }
      setCustomer(data.customer);
      setMessage("Profile photo updated.");
    } finally {
      setUploadingProfilePhoto(false);
    }
  }

  function handleRepeatOrderWithChanges(r: (typeof requests)[number]) {
    const repeatedItems: CartItem[] = r.items.map((it) => ({
      localId: `ci_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      sourceType:
        it.sourceType === "CATALOGUE" && it.designId ? "CATALOGUE" : "CUSTOM",
      designId: it.designId || null,
      code: it.designSnapshot?.code || "CUSTOM",
      name: it.designSnapshot?.name || "Repeat Jewellery Item",
      thumbnailUrl: it.designSnapshot?.thumbnailUrl || null,
      quantity: Math.max(1, it.quantity || 1),
      size: it.size || "",
      purityId: it.purityId || orderPurities[0]?.id || "",
      targetWeight: it.targetWeight || "",
      requestedChanges: it.requestedChanges || "",
      textInstructions: it.textInstructions || "",
      requestedItemDate: "",
      voiceAttachmentId: it.voiceAttachmentId || null,
      referenceMediaIds: it.referenceMediaIds || [],
    }));
    setCart((prev) => [...prev, ...repeatedItems]);
    setOpenOrderMenuId(null);
    setMessage(
      `Loaded ${r.requestNumber} into Cart — add your changes and submit!`
    );
    setTab("CART");
  }

  function handleDeleteOrder(requestId: string, requestNumber: string) {
    setCancelModal({ mode: "DELETE", requestId, requestNumber });
  }

  function handleRequestCancelApprovedOrder(
    requestId: string,
    requestNumber: string
  ) {
    setCancelReason("Ordered by mistake — please cancel");
    setCancelModal({ mode: "REQUEST_CANCEL", requestId, requestNumber });
  }

  async function confirmCancelModal() {
    if (!cancelModal) return;
    const { mode, requestId, requestNumber } = cancelModal;
    setSubmittingCancel(true);
    setError(null);
    setMessage(null);
    try {
      if (mode === "DELETE") {
        const prev = requests;
        setRequests((cur) => cur.filter((r) => r.id !== requestId));
        const res = await fetch("/api/customer-app", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "DELETE_REQUEST", requestId }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          setRequests(prev);
          setError(data.error || "Could not cancel order");
          return;
        }
        setMessage(`Order ${requestNumber} cancelled and deleted.`);
        setCancelModal(null);
      } else {
        const res = await fetch("/api/customer-app", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "SUBMIT_CHANGE_REQUEST",
            requestId,
            body: `CANCELLATION REQUEST: ${
              cancelReason.trim() || "Customer requested cancellation"
            }`,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          setError(data.error || "Could not send cancellation request");
          return;
        }
        setMessage(`Cancellation request sent to manager for ${requestNumber}.`);
        setCancelModal(null);
        await loadWorkspace();
      }
    } catch {
      setError("Network error while updating order");
    } finally {
      setSubmittingCancel(false);
    }
  }

  async function handleLogout() {
    if (actor?.userId && typeof window !== "undefined") {
      window.localStorage.removeItem(`am_cust_cart_${actor.userId}`);
    }
    clearAllClientCache();
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  const heroSlides = HERO_SHOWCASE_SLIDES;

  useEffect(() => {
    if (heroSlides.length <= 1) return;
    const id = setInterval(() => {
      setHeroSlide((i) => (i + 1) % heroSlides.length);
    }, 3500);
    return () => clearInterval(id);
  }, [heroSlides.length]);

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 2800);
    return () => clearTimeout(t);
  }, [message]);

  if (loading || !actor) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 rounded-3xl bg-white border border-[#9E7C42]/30 shadow-sm flex items-center justify-center p-2.5 animate-pulse">
          <img
            src="/am-logo-icon.png"
            alt="AM Jewellery"
            className="w-full h-full object-contain"
          />
        </div>
        <div className="font-serif text-lg font-semibold text-[#0F3D2E] mt-4">
          AM Jewellery
        </div>
      </div>
    );
  }

  const galleryPhotos = selectedDesign
    ? Array.from(
        new Set(
          [selectedDesign.thumbnailUrl, ...(selectedDesign.photos || [])].filter(
            (x): x is string => Boolean(x)
          )
        )
      )
    : [];

  const visibleDesigns = savedOnly
    ? designs.filter((d) => wishlistIds.includes(d.id))
    : designs;

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-stone-900 flex flex-col pb-20 md:pb-6">
      <StagingBanner />
      <header className="bg-white/95 backdrop-blur border-b border-stone-200/80 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 min-h-14 py-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="w-9 h-9 rounded-xl bg-[#FAF9F6] border border-[#9E7C42]/30 flex items-center justify-center p-1 shadow-2xs shrink-0">
              <img
                src="/am-logo-icon.png"
                alt="AM Jewellery"
                className="w-full h-full object-contain"
              />
            </div>
            <div className="min-w-0">
              <div className="font-serif font-semibold text-sm sm:text-base tracking-wide text-[#0F3D2E] leading-tight whitespace-nowrap">
                AM Jewellery
              </div>
              <div className="text-[11px] text-stone-500 truncate">
                Welcome, <span className="font-medium text-stone-700">{customer?.name || "Guest"}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={async () => {
                if (tab === "NOTIFICATIONS") {
                  setTab(lastNonNotifTabRef.current || "DESIGNS");
                  return;
                }
                setTab("NOTIFICATIONS");
                if (unreadCount > 0) {
                  await fetch("/api/notifications", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({}),
                  });
                  setUnreadCount(0);
                }
              }}
              aria-label="Notifications"
              className="relative p-2 rounded-full border border-stone-200 text-stone-600 hover:bg-stone-50 cursor-pointer"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-600" />
              )}
            </button>
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-stone-200 rounded-full text-stone-600 hover:bg-stone-50 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>

        {/* Desktop Navigation Tabs */}
        <div className="hidden md:flex max-w-6xl mx-auto px-4 pb-2.5 gap-1.5 overflow-x-auto text-xs">
          {(
            [
              ["DESIGNS", "Designs", ShoppingBag],
              ["CUSTOM", "Custom Upload", Sparkles],
              ["CART", `Cart (${cart.length})`, ShoppingCart],
              ["ORDERS", `My Orders (${requests.length})`, FileText],
              ["NOTIFICATIONS", `Updates (${unreadCount})`, Bell],
              ["PROFILE", "Profile", User],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              onClick={async () => {
                setTab(key);
                if (key === "NOTIFICATIONS" && unreadCount > 0) {
                  await fetch("/api/notifications", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({}),
                  });
                  setUnreadCount(0);
                }
              }}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full font-medium whitespace-nowrap cursor-pointer transition-colors ${
                tab === key
                  ? "bg-[#0F3D2E] text-white shadow-2xs"
                  : "bg-stone-100 text-stone-700 hover:bg-stone-200"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-6xl w-full mx-auto px-3 sm:px-4 py-4 sm:py-5 space-y-4 flex-1">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
            {error}
          </div>
        )}

        {/* TAB 1: DESIGNS (Luxury Jewellery Storefront) */}
        {tab === "DESIGNS" && (
          <div className="space-y-4">
            {/* JioHotstar-style Auto-Sliding Jewellery Showcase */}
            {(() => {
              const activeSlide =
                heroSlides.length > 0
                  ? heroSlides[heroSlide % heroSlides.length]
                  : null;
              const gradient =
                activeSlide?.bgGradient ||
                "from-[#0F3D2E] via-[#134E3A] to-[#1B5E46]";
              return (
                <div
                  className={`rounded-2xl bg-gradient-to-r ${gradient} text-white p-4 sm:p-5 h-[164px] sm:h-[180px] flex items-center shadow-sm border border-[#9E7C42]/30 overflow-hidden transition-all duration-700`}
                >
                  <div className="flex items-center justify-between gap-3 sm:gap-4 w-full">
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/15 text-[11px] font-medium text-amber-200 max-w-full truncate">
                        <Sparkles className="w-3 h-3 shrink-0" />
                        <span className="truncate">{activeSlide?.categoryName || "AM Jewellery Heritage"}</span>
                      </div>
                      <h1 className="font-serif text-[15px] sm:text-xl font-semibold tracking-wide leading-snug line-clamp-2">
                        {activeSlide?.name || "Handcrafted Gold & Diamond Jewellery"}
                      </h1>
                      <p className="text-[11px] sm:text-xs text-white/85 leading-snug line-clamp-2 max-w-lg">
                        {activeSlide?.description ||
                          "Crafted with precision purity, hallmarked finishing, and custom sizing for your showroom."}
                      </p>
                      {heroSlides.length > 1 && (
                        <div className="flex items-center gap-1.5 pt-1.5">
                          {heroSlides.map((s, idx) => (
                            <button
                              key={s.id}
                              type="button"
                              aria-label={`Slide ${idx + 1}`}
                              onClick={() => setHeroSlide(idx)}
                              className={`h-1.5 rounded-full transition-all cursor-pointer ${
                                idx === heroSlide % heroSlides.length
                                  ? "w-5 bg-[#E6C27A]"
                                  : "w-1.5 bg-white/35 hover:bg-white/60"
                              }`}
                            />
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="relative w-24 h-24 sm:w-40 sm:h-36 rounded-2xl bg-white/10 border border-white/20 shadow-lg shrink-0 overflow-hidden flex items-center justify-center">
                      {heroSlides.map((s, idx) => {
                        const isActive = idx === heroSlide % heroSlides.length;
                        return (
                          <img
                            key={s.id}
                            src={s.thumbnailUrl || "/am-logo-icon.png"}
                            alt={s.name || "AM Jewellery"}
                            loading="eager"
                            decoding="async"
                            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ${
                              isActive
                                ? "opacity-100"
                                : "opacity-0 pointer-events-none"
                            }`}
                          />
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Search & Category Pills */}
            <div className="bg-white border border-stone-200/90 rounded-2xl p-3.5 space-y-3 shadow-2xs">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="w-4 h-4 text-stone-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => {
                      setPage(1);
                      setSearch(e.target.value);
                    }}
                    placeholder="Search rings, necklaces, bangles..."
                    className="w-full pl-9 pr-3 py-2 text-xs border border-stone-200 rounded-xl bg-stone-50/70 focus:bg-white focus:outline-none focus:border-[#0F3D2E]"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setSavedOnly((v) => !v)}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 border rounded-xl text-xs font-medium cursor-pointer transition-colors ${
                    savedOnly
                      ? "bg-rose-50 border-rose-200 text-rose-700"
                      : "border-stone-200 text-stone-700 hover:bg-stone-50"
                  }`}
                >
                  <Heart className={`w-3.5 h-3.5 ${savedOnly ? "fill-rose-500 text-rose-500" : ""}`} />
                  Saved ({wishlistIds.length})
                </button>
                <button
                  type="button"
                  onClick={() => setShowFilters((v) => !v)}
                  className="px-3 py-2 border border-stone-200 rounded-xl text-xs font-medium text-stone-700 hover:bg-stone-50 cursor-pointer"
                >
                  {showFilters ? "Hide Filters" : "Filters"}
                </button>
              </div>

              {/* Category Chips */}
              <div className="flex gap-1.5 overflow-x-auto pb-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setPage(1);
                    setCategoryFilter("ALL");
                  }}
                  className={`px-3.5 py-1.5 rounded-full whitespace-nowrap cursor-pointer transition-colors ${
                    categoryFilter === "ALL"
                      ? "bg-[#0F3D2E] text-white font-medium"
                      : "bg-stone-100 text-stone-700 hover:bg-stone-200"
                  }`}
                >
                  All
                </button>
                {categories.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setPage(1);
                      setCategoryFilter(c.id);
                    }}
                    className={`px-3.5 py-1.5 rounded-full whitespace-nowrap cursor-pointer transition-colors ${
                      categoryFilter === c.id
                        ? "bg-[#0F3D2E] text-white font-medium"
                        : "bg-stone-100 text-stone-700 hover:bg-stone-200"
                    }`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>

              {showFilters && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-stone-100 text-xs">
                  <select
                    value={purityFilter}
                    onChange={(e) => {
                      setPage(1);
                      setPurityFilter(e.target.value);
                    }}
                    className="px-2.5 py-1.5 border border-stone-200 rounded-lg bg-white"
                  >
                    <option value="ALL">All Purities</option>
                    {purities.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.displayLabel}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={sizeFilter}
                    onChange={(e) => {
                      setPage(1);
                      setSizeFilter(e.target.value);
                    }}
                    placeholder="Size (e.g. 14)"
                    className="px-2.5 py-1.5 border border-stone-200 rounded-lg"
                  />
                  <input
                    type="number"
                    step="0.1"
                    value={minWeight}
                    onChange={(e) => {
                      setPage(1);
                      setMinWeight(e.target.value);
                    }}
                    placeholder="Min Wt (g)"
                    className="px-2.5 py-1.5 border border-stone-200 rounded-lg font-mono"
                  />
                  <input
                    type="number"
                    step="0.1"
                    value={maxWeight}
                    onChange={(e) => {
                      setPage(1);
                      setMaxWeight(e.target.value);
                    }}
                    placeholder="Max Wt (g)"
                    className="px-2.5 py-1.5 border border-stone-200 rounded-lg font-mono"
                  />
                </div>
              )}
            </div>

            {/* Clean Product Grid or Updating Soon Placeholder */}
            {CATALOGUE_UPDATING_SOON || visibleDesigns.length === 0 ? (
              <div className="bg-white border border-stone-200/90 rounded-2xl p-8 sm:p-12 text-center space-y-3 shadow-2xs">
                <div className="w-12 h-12 rounded-2xl bg-[#FAF9F6] border border-[#9E7C42]/30 flex items-center justify-center mx-auto">
                  <Sparkles className="w-6 h-6 text-[#9E7C42]" />
                </div>
                <h2 className="font-serif text-lg sm:text-xl font-semibold text-[#0F3D2E]">
                  Designs Catalogue Updating Soon
                </h2>
                <p className="text-xs sm:text-sm text-stone-500 max-w-md mx-auto leading-relaxed">
                  We are curating and uploading our latest AM Jewellery collection here. In the meantime, you can place any bespoke order by uploading your reference photo or sketch.
                </p>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={openCustomUploadTab}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0F3D2E] hover:bg-[#14533E] text-white text-xs font-semibold cursor-pointer transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Upload Custom Design
                  </button>
                </div>
              </div>
            ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5">
              {visibleDesigns.map((d) => {
                const purityText = d.supportedPurityIds
                  .map((pid) => purityNameById.get(pid))
                  .filter(Boolean)
                  .join(" • ");
                const isWished = wishlistIds.includes(d.id);
                return (
                  <div
                    key={d.id}
                    className="group relative bg-white border border-stone-200/90 rounded-2xl overflow-hidden hover:shadow-md hover:border-[#9E7C42]/50 transition-all flex flex-col"
                  >
                    <button
                      type="button"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        toggleWishlist(d.id);
                      }}
                      aria-label={isWished ? "Remove from saved" : "Save design"}
                      className="absolute top-2.5 right-2.5 z-10 w-8 h-8 rounded-full bg-white/90 border border-stone-200/80 flex items-center justify-center text-stone-500 hover:text-rose-600 shadow-2xs cursor-pointer"
                    >
                      <Heart
                        className={`w-4 h-4 ${
                          isWished ? "fill-rose-500 text-rose-500" : ""
                        }`}
                      />
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedDesign(d);
                        setActivePhotoIndex(0);
                        setModalPurityId(d.supportedPurityIds[0] || purities[0]?.id || "");
                        setModalCustomPurity("");
                        setModalSize(d.supportedSizes[0] || "");
                      }}
                      className="text-left flex-1 flex flex-col cursor-pointer"
                    >
                      <div className="aspect-square bg-white w-full overflow-hidden border-b border-stone-100 p-2">
                        {d.thumbnailUrl ? (
                          <img
                            src={d.thumbnailUrl}
                            alt={d.name}
                            className="w-full h-full object-contain group-hover:scale-[1.03] transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xs text-stone-400">
                            No Photo
                          </div>
                        )}
                      </div>
                      <div className="p-3 space-y-1 text-xs flex-1 flex flex-col justify-between">
                        <div className="font-semibold text-stone-900 line-clamp-1">
                          {d.name}
                        </div>
                        <div className="space-y-0.5 text-[11px] text-stone-500">
                          {purityText && (
                            <div className="text-[#9E7C42] font-medium truncate">
                              {purityText}
                            </div>
                          )}
                          {(d.approxWeightMin || d.approxWeightMax) && (
                            <div className="font-mono text-stone-700">
                              {d.approxWeightMin || "?"}–{d.approxWeightMax || "?"} g
                            </div>
                          )}
                        </div>
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
            )}

            {totalPages > 1 && (
              <div className="flex justify-between items-center text-xs bg-white border border-stone-200 rounded-xl px-4 py-2.5">
                <span className="text-stone-600">
                  Page {page} of {totalPages}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                    className="px-3 py-1 border border-stone-200 rounded-lg disabled:opacity-40 cursor-pointer"
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    className="px-3 py-1 border border-stone-200 rounded-lg disabled:opacity-40 cursor-pointer"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: DEDICATED CUSTOM DESIGN UPLOAD */}
        {tab === "CUSTOM" && (
          <form onSubmit={addCustomDraftToCart} className="space-y-4">
            <div className="bg-white border border-stone-200/90 rounded-2xl p-4 sm:p-6 shadow-2xs space-y-5">
              <div className="flex items-center justify-between gap-2 border-b border-stone-100 pb-3.5">
                <div>
                  <h2 className="font-serif text-base sm:text-lg font-semibold text-[#0F3D2E] flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[#9E7C42]" />
                    Custom Jewellery Order
                  </h2>
                  <p className="text-xs text-stone-500 mt-0.5">
                    Upload a photo or sketch and enter your details.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={resetCustomDraft}
                  className="px-3 py-1.5 text-xs border border-stone-200 rounded-full text-stone-600 hover:bg-stone-50 cursor-pointer shrink-0"
                >
                  Clear
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                {/* Left Column: Photo Studio */}
                <div className="lg:col-span-5 space-y-3">
                  <label className="block text-xs font-semibold text-stone-700">
                    Reference Photo / Sketch
                  </label>
                  <label className="flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed border-stone-300 hover:border-[#9E7C42] rounded-2xl bg-[#FAF9F6] hover:bg-amber-50/30 transition-colors cursor-pointer text-center">
                    <div className="w-11 h-11 rounded-full bg-white border border-[#9E7C42]/30 flex items-center justify-center text-[#0F3D2E] shadow-2xs">
                      {uploadingCustomPhoto ? (
                        <Upload className="w-5 h-5 animate-pulse text-[#9E7C42]" />
                      ) : (
                        <ImagePlus className="w-5 h-5" />
                      )}
                    </div>
                    <div className="text-xs font-semibold text-stone-800">
                      {uploadingCustomPhoto
                        ? "Uploading..."
                        : "Tap to upload photo"}
                    </div>
                    <div className="text-[11px] text-stone-500">
                      JPG or PNG • Multiple photos allowed
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      disabled={uploadingCustomPhoto}
                      onChange={(e) => {
                        void uploadCustomDraftImages(e.target.files);
                        e.target.value = "";
                      }}
                    />
                  </label>

                  {customMediaIds.length > 0 && (
                    <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-3 gap-2.5 pt-1">
                      {customMediaIds.map((id, idx) => (
                        <div
                          key={id}
                          className="relative group aspect-square rounded-xl overflow-hidden border border-stone-200 bg-stone-100"
                        >
                          <img
                            src={`/api/app-attachments/${id}`}
                            alt={`Custom reference ${idx + 1}`}
                            className="w-full h-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setCustomMediaIds((prev) => prev.filter((x) => x !== id))
                            }
                            aria-label="Remove photo"
                            className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-stone-900/80 text-white flex items-center justify-center hover:bg-red-600 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Right Column: Clean Short Specifications */}
                <div className="lg:col-span-7 space-y-4 text-xs">
                  <div>
                    <label className="block font-semibold text-stone-700 mb-1.5">
                      Jewellery Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={customTitle}
                      onChange={(e) => setCustomTitle(e.target.value)}
                      placeholder="e.g. Gold Ring"
                      className="w-full px-3 py-2.5 border border-stone-200 rounded-xl bg-stone-50/50 focus:bg-white focus:outline-none focus:border-[#0F3D2E]"
                    />
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {["Ring", "Necklace", "Bangle", "Earrings", "Pendant", "Chain"].map(
                        (preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setCustomTitle(preset)}
                            className={`px-3 py-1 rounded-full text-[11px] font-medium cursor-pointer transition-colors ${
                              customTitle === preset
                                ? "bg-[#0F3D2E] text-white"
                                : "bg-stone-100 hover:bg-stone-200 text-stone-700"
                            }`}
                          >
                            {preset}
                          </button>
                        )
                      )}
                    </div>
                  </div>

                  {/* Purity Pills */}
                  <div>
                    <label className="block font-semibold text-stone-700 mb-1.5">
                      Karat / Purity
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {orderPurities.map((p) => {
                        const active = (customPurityId || orderPurities[0]?.id) === p.id;
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              setCustomPurityId(p.id);
                              setCustomPurityText("");
                            }}
                            className={`px-3 py-1.5 rounded-xl border font-medium cursor-pointer transition-colors ${
                              active
                                ? "bg-[#0F3D2E] text-white border-[#0F3D2E]"
                                : "bg-white text-stone-700 border-stone-200 hover:bg-stone-50"
                            }`}
                          >
                            {p.displayLabel}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Qty, Weight, Size, Date */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="block font-semibold text-stone-700 mb-1">
                        Qty *
                      </label>
                      <div className="flex items-center border border-stone-200 rounded-xl overflow-hidden bg-white">
                        <button
                          type="button"
                          onClick={() => setCustomQty((q) => Math.max(1, q - 1))}
                          className="px-2.5 py-2 text-stone-600 hover:bg-stone-100 cursor-pointer"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min={1}
                          required
                          value={customQty}
                          onChange={(e) => setCustomQty(Math.max(1, Number(e.target.value || 1)))}
                          className="w-full text-center py-2 font-mono focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setCustomQty((q) => q + 1)}
                          className="px-2.5 py-2 text-stone-600 hover:bg-stone-100 cursor-pointer"
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block font-semibold text-stone-700 mb-1">
                        Weight (g)
                      </label>
                      <input
                        type="number"
                        step="0.001"
                        value={customWeight}
                        onChange={(e) => setCustomWeight(e.target.value)}
                        placeholder="e.g. 12.5"
                        className="w-full px-3 py-2 border border-stone-200 rounded-xl bg-white font-mono focus:outline-none focus:border-[#0F3D2E]"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-stone-700 mb-1">
                        Size
                      </label>
                      <input
                        type="text"
                        value={customSize}
                        onChange={(e) => setCustomSize(e.target.value)}
                        placeholder="e.g. 14"
                        className="w-full px-3 py-2 border border-stone-200 rounded-xl bg-white focus:outline-none focus:border-[#0F3D2E]"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-stone-700 mb-1">
                        Needed By
                      </label>
                      <input
                        type="date"
                        value={customDate}
                        onChange={(e) => setCustomDate(e.target.value)}
                        className="w-full px-2.5 py-2 border border-stone-200 rounded-xl bg-white font-mono focus:outline-none focus:border-[#0F3D2E]"
                      />
                    </div>
                  </div>

                  {/* Notes & Voice */}
                  <div>
                    <label className="block font-semibold text-stone-700 mb-1">
                      Notes (Optional)
                    </label>
                    <textarea
                      rows={2}
                      value={customInstructions}
                      onChange={(e) => setCustomInstructions(e.target.value)}
                      placeholder="Stone colour, polish, or engraving..."
                      className="w-full px-3 py-2.5 border border-stone-200 rounded-xl bg-stone-50/50 focus:bg-white focus:outline-none focus:border-[#0F3D2E]"
                    />
                  </div>

                  <div className="p-3 bg-[#FAF9F6] border border-stone-200/80 rounded-xl">
                    <div className="font-semibold text-stone-700 mb-1.5">
                      Voice Note (Optional)
                    </div>
                    <VoiceRecorderInput
                      attachmentId={customVoiceId}
                      onUploaded={setCustomVoiceId}
                    />
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
                    <button
                      type="submit"
                      disabled={uploadingCustomPhoto}
                      className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 bg-[#0F3D2E] hover:bg-[#14533E] disabled:opacity-50 text-white rounded-xl font-semibold cursor-pointer transition-colors"
                    >
                      <ShoppingCart className="w-4 h-4" />
                      Add to Cart
                    </button>
                    <button
                      type="button"
                      onClick={() => setTab("DESIGNS")}
                      className="px-4 py-3 border border-stone-200 hover:bg-stone-50 text-stone-700 rounded-xl font-medium cursor-pointer"
                    >
                      Back
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </form>
        )}

        {/* TAB 3: SIMPLE ORDER CART (Summary row + click to expand details) */}
        {tab === "CART" && (
          <form onSubmit={handleSubmitCart} className="space-y-3">
            {cart.length === 0 ? (
              <div className="bg-white border border-stone-200 rounded-xl p-8 text-center text-xs text-stone-500 space-y-3">
                <p>Your order cart is empty.</p>
                <div className="flex justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => setTab("DESIGNS")}
                    className="px-4 py-2 bg-stone-900 text-white rounded-lg font-medium cursor-pointer"
                  >
                    Browse Designs
                  </button>
                  <button
                    type="button"
                    onClick={openCustomUploadTab}
                    className="px-4 py-2 border border-stone-300 rounded-lg font-medium cursor-pointer"
                  >
                    Upload Custom Design
                  </button>
                </div>
              </div>
            ) : (
              <>
                {cart.map((item) => {
                  const isOpen = Boolean(expandedCartIds[item.localId]);
                  const pLabel =
                    item.customPurityLabel ||
                    purityNameById.get(item.purityId) ||
                    "Any Purity";
                  return (
                    <div
                      key={item.localId}
                      className="bg-white border border-stone-200 rounded-xl overflow-hidden text-xs"
                    >
                      {/* Compact Summary Header (click to expand) */}
                      <div
                        onClick={() =>
                          setExpandedCartIds((prev) => ({
                            ...prev,
                            [item.localId]: !prev[item.localId],
                          }))
                        }
                        className="p-3.5 flex items-center justify-between gap-3 cursor-pointer hover:bg-stone-50/70"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {item.thumbnailUrl ? (
                            <img
                              src={item.thumbnailUrl}
                              alt={item.name}
                              className="w-12 h-12 rounded-lg object-cover border border-stone-200 shrink-0"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-lg bg-stone-100 border border-stone-200 flex items-center justify-center text-[10px] text-stone-400 shrink-0">
                              Custom
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="font-semibold text-stone-900 truncate">
                              {item.name}
                            </div>
                            <div className="text-[11px] text-stone-500 mt-0.5">
                              Qty: <strong>{item.quantity}</strong> • {pLabel} •{" "}
                              {item.targetWeight ? `${item.targetWeight}g` : "Weight N/A"}
                              {item.size ? ` • Size ${item.size}` : ""}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <div
                            onClick={(ev) => ev.stopPropagation()}
                            className="inline-flex items-center border border-stone-200 rounded-full bg-stone-50 text-xs"
                          >
                            <button
                              type="button"
                              onClick={() =>
                                setCart((prev) =>
                                  prev.map((c) =>
                                    c.localId === item.localId
                                      ? { ...c, quantity: Math.max(1, c.quantity - 1) }
                                      : c
                                  )
                                )
                              }
                              className="px-2 py-1 text-stone-600 hover:text-stone-900 cursor-pointer"
                            >
                              -
                            </button>
                            <span className="px-1.5 font-mono font-semibold">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setCart((prev) =>
                                  prev.map((c) =>
                                    c.localId === item.localId
                                      ? { ...c, quantity: c.quantity + 1 }
                                      : c
                                  )
                                )
                              }
                              className="px-2 py-1 text-stone-600 hover:text-stone-900 cursor-pointer"
                            >
                              +
                            </button>
                          </div>
                          <span className="hidden sm:inline-flex text-[11px] font-medium text-[#9E7C42] items-center gap-1">
                            {isOpen ? (
                              <>
                                Less <ChevronUp className="w-3.5 h-3.5" />
                              </>
                            ) : (
                              <>
                                Edit <ChevronDown className="w-3.5 h-3.5" />
                              </>
                            )}
                          </span>
                          <button
                            type="button"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              setCart((prev) =>
                                prev.filter((x) => x.localId !== item.localId)
                              );
                            }}
                            className="p-1.5 text-stone-400 hover:text-red-600 cursor-pointer"
                            title="Remove"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Expanded Specifications / Voice / Custom Photos */}
                      {isOpen && (
                        <div className="p-4 pt-3 border-t border-stone-100 space-y-3 bg-stone-50/40">
                          {item.sourceType === "CUSTOM" && (
                            <div>
                              <label className="block font-medium text-stone-600 mb-1">
                                Custom Design Title *
                              </label>
                              <input
                                type="text"
                                required
                                value={item.name}
                                onChange={(e) =>
                                  setCart((prev) =>
                                    prev.map((c) =>
                                      c.localId === item.localId
                                        ? { ...c, name: e.target.value }
                                        : c
                                    )
                                  )
                                }
                                className="w-full px-2.5 py-1.5 border border-stone-200 rounded-lg bg-white"
                              />
                            </div>
                          )}

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                            <div>
                              <label className="block font-medium text-stone-600 mb-1">
                                Quantity *
                              </label>
                              <input
                                type="number"
                                min={1}
                                required
                                value={item.quantity}
                                onChange={(e) =>
                                  setCart((prev) =>
                                    prev.map((c) =>
                                      c.localId === item.localId
                                        ? {
                                            ...c,
                                            quantity: Math.max(
                                              1,
                                              Number(e.target.value || 1)
                                            ),
                                          }
                                        : c
                                    )
                                  )
                                }
                                className="w-full px-2.5 py-1.5 border border-stone-200 rounded-lg bg-white font-mono"
                              />
                            </div>
                            <div>
                              <label className="block font-medium text-stone-600 mb-1">
                                Size
                              </label>
                              <input
                                type="text"
                                value={item.size}
                                onChange={(e) =>
                                  setCart((prev) =>
                                    prev.map((c) =>
                                      c.localId === item.localId
                                        ? { ...c, size: e.target.value }
                                        : c
                                    )
                                  )
                                }
                                placeholder="e.g. 14"
                                className="w-full px-2.5 py-1.5 border border-stone-200 rounded-lg bg-white"
                              />
                            </div>
                            <div>
                              <label className="block font-medium text-stone-600 mb-1">
                                Purity
                              </label>
                              <select
                                value={item.purityId}
                                onChange={(e) =>
                                  setCart((prev) =>
                                    prev.map((c) =>
                                      c.localId === item.localId
                                        ? { ...c, purityId: e.target.value }
                                        : c
                                    )
                                  )
                                }
                                className="w-full px-2.5 py-1.5 border border-stone-200 rounded-lg bg-white"
                              >
                                <option value="">Select purity</option>
                                {orderPurities.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.displayLabel}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block font-medium text-stone-600 mb-1">
                                Target Weight (g)
                              </label>
                              <input
                                type="number"
                                step="0.001"
                                value={item.targetWeight}
                                onChange={(e) =>
                                  setCart((prev) =>
                                    prev.map((c) =>
                                      c.localId === item.localId
                                        ? { ...c, targetWeight: e.target.value }
                                        : c
                                    )
                                  )
                                }
                                className="w-full px-2.5 py-1.5 border border-stone-200 rounded-lg bg-white font-mono"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            <div>
                              <label className="block font-medium text-stone-600 mb-1">
                                Requested Changes
                              </label>
                              <input
                                type="text"
                                value={item.requestedChanges}
                                onChange={(e) =>
                                  setCart((prev) =>
                                    prev.map((c) =>
                                      c.localId === item.localId
                                        ? { ...c, requestedChanges: e.target.value }
                                        : c
                                    )
                                  )
                                }
                                placeholder="Any modifications..."
                                className="w-full px-2.5 py-1.5 border border-stone-200 rounded-lg bg-white"
                              />
                            </div>
                            <div>
                              <label className="block font-medium text-stone-600 mb-1">
                                Text Instructions
                              </label>
                              <input
                                type="text"
                                value={item.textInstructions}
                                onChange={(e) =>
                                  setCart((prev) =>
                                    prev.map((c) =>
                                      c.localId === item.localId
                                        ? { ...c, textInstructions: e.target.value }
                                        : c
                                    )
                                  )
                                }
                                placeholder="Additional instructions..."
                                className="w-full px-2.5 py-1.5 border border-stone-200 rounded-lg bg-white"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block font-medium text-stone-600 mb-1">
                              Reference Photos ({item.referenceMediaIds.length} uploaded)
                            </label>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) void uploadItemReferenceImage(item.localId, f);
                              }}
                              className="text-xs"
                            />
                          </div>

                          <VoiceRecorderInput
                            attachmentId={item.voiceAttachmentId}
                            onUploaded={(attId) =>
                              setCart((prev) =>
                                prev.map((c) =>
                                  c.localId === item.localId
                                    ? { ...c, voiceAttachmentId: attId }
                                    : c
                                )
                              )
                            }
                          />
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Customer Delivery Info Card */}
                <div className="bg-white border border-stone-200/90 rounded-2xl p-4 flex items-center justify-between gap-3 text-xs shadow-2xs">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-[#FAF9F6] border border-[#9E7C42]/40 flex items-center justify-center text-[#0F3D2E] shrink-0">
                      <User className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-stone-900 truncate">
                        {customer?.name || "Customer"}{" "}
                        <span className="font-mono text-[11px] text-stone-400">
                          ({customer?.customerCode})
                        </span>
                      </div>
                      <div className="text-[11px] text-stone-500 truncate">
                        {customer?.phone || "No phone"} •{" "}
                        {customer?.address || "Showroom / Pickup"}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTab("PROFILE")}
                    className="text-[11px] font-medium text-[#0F3D2E] hover:underline shrink-0 cursor-pointer"
                  >
                    Profile
                  </button>
                </div>

                {/* Delivery Date, Note & Dashed Receipt Order Details */}
                <div className="bg-white border border-stone-200/90 rounded-2xl p-4 sm:p-5 space-y-4 text-xs shadow-2xs">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-stone-700 mb-1">
                        Requested Delivery Date
                      </label>
                      <input
                        type="date"
                        value={requestedDeliveryDate}
                        onChange={(e) => setRequestedDeliveryDate(e.target.value)}
                        className="w-full px-3 py-2.5 border border-stone-200 rounded-xl font-mono bg-stone-50/50 focus:bg-white focus:outline-none focus:border-[#0F3D2E]"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-stone-700 mb-1">
                        Order Note (Optional)
                      </label>
                      <input
                        type="text"
                        value={customerNote}
                        onChange={(e) => setCustomerNote(e.target.value)}
                        placeholder="Note for manager..."
                        className="w-full px-3 py-2.5 border border-stone-200 rounded-xl bg-stone-50/50 focus:bg-white focus:outline-none focus:border-[#0F3D2E]"
                      />
                    </div>
                  </div>

                  {/* Dashed Receipt Order Details Box */}
                  <div className="border-2 border-dashed border-stone-300 rounded-2xl p-4 bg-[#FAF9F6]/60 space-y-2">
                    <div className="text-center font-serif font-semibold text-sm text-stone-900 pb-1">
                      Order Details
                    </div>
                    <div className="flex justify-between text-stone-600">
                      <span>Total Designs</span>
                      <span className="font-mono font-semibold text-stone-900">
                        {cart.length}
                      </span>
                    </div>
                    <div className="flex justify-between text-stone-600">
                      <span>Total Pieces</span>
                      <span className="font-mono font-semibold text-stone-900">
                        {cart.reduce((s, c) => s + c.quantity, 0)} pcs
                      </span>
                    </div>
                    <div className="flex justify-between text-stone-600">
                      <span>Est. Target Weight</span>
                      <span className="font-mono font-semibold text-stone-900">
                        {cart
                          .reduce(
                            (s, c) =>
                              s + (Number(c.targetWeight || 0) * c.quantity),
                            0
                          )
                          .toFixed(3)}{" "}
                        g
                      </span>
                    </div>
                    <div className="flex justify-between text-stone-600">
                      <span>Requested Delivery</span>
                      <span className="font-mono font-semibold text-[#0F3D2E]">
                        {requestedDeliveryDate || "Flexible"}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                    <div className="text-stone-700">
                      Selected{" "}
                      <strong className="text-stone-900">
                        {cart.reduce((s, c) => s + c.quantity, 0)} pc(s)
                      </strong>{" "}
                      • Est.{" "}
                      <strong className="font-mono text-[#0F3D2E]">
                        {cart
                          .reduce(
                            (s, c) =>
                              s + (Number(c.targetWeight || 0) * c.quantity),
                            0
                          )
                          .toFixed(3)}{" "}
                        g
                      </strong>
                    </div>
                    <button
                      type="submit"
                      disabled={submittingOrder}
                      className="sm:w-auto w-full px-7 py-3 bg-[#0F3D2E] hover:bg-[#14533E] disabled:opacity-50 text-white rounded-xl font-semibold text-sm cursor-pointer transition-colors"
                    >
                      {submittingOrder ? "Submitting Order..." : "Submit Order"}
                    </button>
                  </div>
                </div>
              </>
            )}
          </form>
        )}

        {/* TAB 3: MY ORDERS */}
        {tab === "ORDERS" && (
          <div className="space-y-3.5">
            {requests.length > 0 && (
              <div className="flex gap-1.5 overflow-x-auto pb-0.5 text-xs">
                {(
                  [
                    ["ALL", `All (${requests.length})`],
                    ["AWAITING_APPROVAL", "Pending"],
                    ["APPROVED", "Approved"],
                    ["READY", "Ready"],
                    ["DECLINED", "Declined"],
                  ] as const
                ).map(([fKey, fLabel]) => (
                  <button
                    key={fKey}
                    type="button"
                    onClick={() => setOrderFilter(fKey)}
                    className={`px-3.5 py-1.5 rounded-full font-medium whitespace-nowrap cursor-pointer transition-colors ${
                      orderFilter === fKey
                        ? "bg-[#0F3D2E] text-white"
                        : "bg-white border border-stone-200 text-stone-700 hover:bg-stone-50"
                    }`}
                  >
                    {fLabel}
                  </button>
                ))}
              </div>
            )}

            {requests.filter((r) => orderFilter === "ALL" || r.status === orderFilter).length === 0 ? (
              <div className="bg-white border border-stone-200 rounded-2xl p-10 text-center text-xs text-stone-500 space-y-3">
                <p>No orders match this filter.</p>
                <button
                  type="button"
                  onClick={openCustomUploadTab}
                  className="px-4 py-2 bg-[#0F3D2E] text-white rounded-xl font-medium cursor-pointer"
                >
                  Place Custom Order
                </button>
              </div>
            ) : (
              requests
                .filter((r) => orderFilter === "ALL" || r.status === orderFilter)
                .map((r) => {
                const badgeClass =
                  r.status === "APPROVED" || r.status === "READY" || r.status === "DELIVERED"
                    ? "bg-emerald-50 text-[#0F3D2E] border-emerald-200"
                    : r.status === "DECLINED"
                    ? "bg-red-50 text-red-700 border-red-200"
                    : r.status === "MORE_DETAILS_NEEDED"
                    ? "bg-amber-50 text-amber-800 border-amber-200"
                    : "bg-stone-100 text-stone-800 border-stone-200";
                const stepLevel =
                  r.status === "READY" || r.status === "DELIVERED"
                    ? 3
                    : r.status === "APPROVED"
                    ? 2
                    : r.status === "DECLINED"
                    ? 0
                    : 1;
                return (
                <div
                  key={r.id}
                  className="bg-white border border-stone-200/90 rounded-2xl p-4 sm:p-5 space-y-3.5 text-xs shadow-2xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 pb-3">
                    <div>
                      <span className="font-mono font-bold text-stone-900 text-sm">
                        {r.requestNumber}
                      </span>
                      <span className="text-stone-400 ml-2 font-mono">
                        {r.submittedAt.slice(0, 10)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 relative">
                      <span className={`px-3 py-1 rounded-full border font-semibold ${badgeClass}`}>
                        {r.statusLabel}
                      </span>
                      {(r.linkedBills ?? []).length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            const b = r.linkedBills![0];
                            if (b?.previewHtml) {
                              setViewingBillHtml(b.previewHtml);
                            }
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 text-[11px] font-semibold cursor-pointer"
                        >
                          <FileText className="w-3 h-3" />
                          <span>Bill {r.linkedBills![0].billNumber}</span>
                        </button>
                      )}
                      <button
                        type="button"
                        aria-label="Order options"
                        onClick={() =>
                          setOpenOrderMenuId((cur) => (cur === r.id ? null : r.id))
                        }
                        className="p-1.5 rounded-full border border-stone-200 text-stone-600 hover:bg-stone-100 cursor-pointer"
                      >
                        <MoreVertical className="w-3.5 h-3.5" />
                      </button>
                      {openOrderMenuId === r.id && (
                        <div className="absolute right-0 top-8 z-20 w-52 bg-white border border-stone-200 rounded-xl shadow-lg py-1 text-xs">
                          <button
                            type="button"
                            onClick={() => handleRepeatOrderWithChanges(r)}
                            className="w-full px-3 py-2 text-left flex items-center gap-2 text-stone-800 hover:bg-stone-50 font-medium cursor-pointer"
                          >
                            <RotateCcw className="w-3.5 h-3.5 text-[#0F3D2E]" />
                            <span>Repeat Order (With Changes)</span>
                          </button>
                          {(r.linkedBills ?? []).map((b) =>
                            b.previewHtml ? (
                              <button
                                key={b.id}
                                type="button"
                                onClick={() => {
                                  setOpenOrderMenuId(null);
                                  setViewingBillHtml(b.previewHtml);
                                }}
                                className="w-full px-3 py-2 text-left flex items-center gap-2 text-emerald-800 hover:bg-emerald-50 font-medium cursor-pointer"
                              >
                                <FileText className="w-3.5 h-3.5" />
                                <span>View Bill ({b.billNumber})</span>
                              </button>
                            ) : null
                          )}
                          {(r.status === "AWAITING_APPROVAL" ||
                            r.status === "MORE_DETAILS_NEEDED" ||
                            r.status === "DECLINED") && (
                            <button
                              type="button"
                              onClick={() => {
                                setOpenOrderMenuId(null);
                                void handleDeleteOrder(r.id, r.requestNumber);
                              }}
                              className="w-full px-3 py-2 text-left flex items-center gap-2 text-red-700 hover:bg-red-50 font-medium cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Cancel / Delete Order</span>
                            </button>
                          )}
                          {r.status === "APPROVED" && (
                            <button
                              type="button"
                              onClick={() => {
                                setOpenOrderMenuId(null);
                                void handleRequestCancelApprovedOrder(
                                  r.id,
                                  r.requestNumber
                                );
                              }}
                              className="w-full px-3 py-2 text-left flex items-center gap-2 text-amber-800 hover:bg-amber-50 font-medium cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                              <span>Request Cancellation</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Visual 3-Step Order Tracker */}
                  {stepLevel > 0 && (
                    <div className="grid grid-cols-3 gap-1.5 text-[11px] pt-0.5">
                      {[
                        [1, "Submitted"],
                        [2, "Approved"],
                        [3, r.status === "DELIVERED" ? "Delivered" : "Ready"],
                      ].map(([lvl, lbl]) => {
                        const done = stepLevel >= Number(lvl);
                        return (
                          <div key={String(lbl)} className="space-y-1">
                            <div
                              className={`h-1.5 rounded-full transition-colors ${
                                done ? "bg-[#0F3D2E]" : "bg-stone-200"
                              }`}
                            />
                            <div
                              className={`text-center font-medium ${
                                done ? "text-[#0F3D2E]" : "text-stone-400"
                              }`}
                            >
                              {lbl}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 p-2.5 rounded-xl bg-[#FAF9F6] border border-stone-200/70 text-stone-600">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-stone-400">
                        Requested Date
                      </div>
                      <strong className="font-mono text-stone-800">
                        {r.requestedDeliveryDate || "Flexible"}
                      </strong>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-stone-400">
                        Confirmed Delivery
                      </div>
                      <strong className="font-mono text-[#0F3D2E]">
                        {r.confirmedDeliveryDate || "Pending"}
                      </strong>
                    </div>
                  </div>

                  {r.managerVisibleNote && (
                    <div className="p-3 bg-emerald-50/50 border border-emerald-200/70 rounded-xl text-stone-800">
                      <strong className="text-[#0F3D2E]">Manager Note:</strong> {r.managerVisibleNote}
                    </div>
                  )}
                  {r.declineReason && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700">
                      <strong>Declined:</strong> {r.declineReason}
                    </div>
                  )}

                  <div className="space-y-2">
                    {r.items.map((it) => {
                      const thumb =
                        it.designSnapshot?.thumbnailUrl ||
                        (it.referenceMediaIds?.[0]
                          ? `/api/app-attachments/${it.referenceMediaIds[0]}`
                          : null);
                      return (
                      <div
                        key={it.id}
                        className="p-3 border border-stone-200/80 rounded-xl bg-white flex gap-3 items-start"
                      >
                        {thumb ? (
                          <button
                            type="button"
                            onClick={() => setPreviewOrderPhoto(thumb)}
                            className="w-16 h-16 rounded-xl overflow-hidden border border-stone-200 shrink-0 cursor-pointer hover:opacity-90"
                          >
                            <img
                              src={thumb}
                              alt={it.designSnapshot?.name || "Item"}
                              className="w-full h-full object-cover"
                            />
                          </button>
                        ) : (
                          <div className="w-16 h-16 rounded-xl bg-stone-100 border border-stone-200 flex items-center justify-center text-[10px] text-stone-400 shrink-0">
                            Jewellery
                          </div>
                        )}
                        <div className="flex-1 min-w-0 space-y-1.5">
                          <div className="flex items-start justify-between gap-2">
                            <div className="font-semibold text-stone-900 leading-snug">
                              {it.designSnapshot?.name}
                            </div>
                            <span className="px-2 py-0.5 rounded-full bg-stone-100 text-stone-700 font-mono text-[10px] font-semibold shrink-0">
                              × {it.quantity}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1.5 text-[10px]">
                            {it.purityLabelSnapshot && (
                              <span className="px-2 py-0.5 rounded-md bg-amber-50/80 border border-[#9E7C42]/30 text-[#7D5E2A] font-medium">
                                {it.purityLabelSnapshot}
                              </span>
                            )}
                            {it.size && (
                              <span className="px-2 py-0.5 rounded-md bg-[#FAF9F6] border border-stone-200 text-stone-700 font-mono">
                                Size {it.size}
                              </span>
                            )}
                            {it.targetWeight && (
                              <span className="px-2 py-0.5 rounded-md bg-[#FAF9F6] border border-stone-200 text-stone-700 font-mono">
                                {it.targetWeight}g
                              </span>
                            )}
                          </div>
                          {it.textInstructions && (
                            <div className="text-[11px] text-stone-600 bg-stone-50/70 px-2.5 py-1.5 rounded-lg border border-stone-100">
                              {it.textInstructions}
                            </div>
                          )}
                          {it.voiceAttachmentId && (
                            <audio
                              controls
                              src={`/api/app-attachments/${it.voiceAttachmentId}`}
                              className="w-full h-8 mt-1"
                            />
                          )}
                        </div>
                      </div>
                    );
                    })}
                  </div>

                  {r.messages.length > 0 && (
                    <div className="space-y-1.5 border-t border-stone-100 pt-2.5">
                      {r.messages.map((m) => (
                        <div
                          key={m.id}
                          className="px-3 py-2 rounded-xl bg-[#FAF9F6] border border-stone-200/70 text-[11px] text-stone-700"
                        >
                          <strong className="text-[#0F3D2E]">{m.senderName}:</strong> {m.body}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-2 pt-1">
                    <input
                      type="text"
                      value={replyTextByReq[r.id] || ""}
                      onChange={(e) =>
                        setReplyTextByReq((prev) => ({
                          ...prev,
                          [r.id]: e.target.value,
                        }))
                      }
                      placeholder={
                        r.status === "APPROVED"
                          ? "Request a change..."
                          : "Send a message..."
                      }
                      className="flex-1 px-3 py-1.5 border border-stone-200 rounded-lg"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        const txt = (replyTextByReq[r.id] || "").trim();
                        if (!txt) return;
                        await fetch("/api/customer-app", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            action:
                              r.status === "APPROVED"
                                ? "SUBMIT_CHANGE_REQUEST"
                                : "SEND_MESSAGE",
                            requestId: r.id,
                            body: txt,
                          }),
                        });
                        setReplyTextByReq((prev) => ({ ...prev, [r.id]: "" }));
                        await loadWorkspace();
                      }}
                      className="inline-flex items-center gap-1 px-3.5 py-1.5 bg-[#0F3D2E] hover:bg-[#14533E] text-white rounded-xl font-medium cursor-pointer"
                    >
                      <Send className="w-3 h-3" />
                      Send
                    </button>
                  </div>
                </div>
                );
              })
            )}
          </div>
        )}

        {/* TAB 4: NOTIFICATIONS */}
        {tab === "NOTIFICATIONS" && (
          <div className="bg-white border border-stone-200 rounded-xl divide-y divide-stone-100">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-xs text-stone-500">
                No updates yet.
              </div>
            ) : (
              notifications.map((n) => (
                <div key={n.id} className="p-3.5 text-xs space-y-0.5">
                  <div className="font-semibold text-stone-900">{n.title}</div>
                  <div className="text-stone-600">{n.body}</div>
                  <div className="text-[10px] text-stone-400">
                    {n.createdAt.slice(0, 16).replace("T", " ")}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* TAB 5: PROFILE */}
        {tab === "PROFILE" && (
          <div className="max-w-xl mx-auto space-y-4">
            {/* Centered Hero Profile Card (matching reference) */}
            <div className="bg-white border border-stone-200/90 rounded-3xl p-6 shadow-2xs text-center space-y-3">
              <div className="relative w-24 h-24 mx-auto">
                {customer?.profilePhotoUrl ? (
                  <img
                    src={customer.profilePhotoUrl}
                    alt={customer.name}
                    className="w-24 h-24 rounded-full object-cover ring-4 ring-[#9E7C42]/25 shadow-sm border border-stone-200"
                  />
                ) : (
                  <div className="w-24 h-24 rounded-full bg-gradient-to-br from-[#0F3D2E] to-[#1B5E46] text-white font-serif font-semibold text-2xl flex items-center justify-center ring-4 ring-[#9E7C42]/20 shadow-sm">
                    {(customer?.name || "C").slice(0, 1).toUpperCase()}
                  </div>
                )}
                <label
                  title="Upload profile or showroom photo"
                  className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-[#0F3D2E] hover:bg-[#14533E] text-white border-2 border-white flex items-center justify-center shadow-sm cursor-pointer"
                >
                  <Camera className={`w-3.5 h-3.5 ${uploadingProfilePhoto ? "animate-pulse" : ""}`} />
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploadingProfilePhoto}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void uploadProfilePhoto(f);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
              <div className="space-y-1">
                <h2 className="font-serif text-lg font-semibold text-stone-900">
                  {customer?.name}
                </h2>
                <div className="text-xs text-stone-500">
                  {customer?.email || customer?.phone || "No contact added"}
                </div>
                <div className="inline-flex items-center justify-center gap-1.5 text-[11px] text-stone-500 pt-0.5">
                  <span className="font-mono text-[#9E7C42] font-semibold">
                    {customer?.customerCode}
                  </span>
                  {customer?.address && (
                    <>
                      <span>•</span>
                      <MapPin className="w-3 h-3 text-[#9E7C42]" />
                      <span className="truncate max-w-[200px]">{customer.address}</span>
                    </>
                  )}
                </div>
              </div>
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setEditingProfile((v) => !v)}
                  className="inline-flex items-center gap-1.5 px-6 py-2.5 rounded-full bg-[#0F3D2E] hover:bg-[#14533E] text-white text-xs font-semibold shadow-2xs cursor-pointer transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  {editingProfile ? "Close Editor" : "Edit Profile"}
                </button>
              </div>
            </div>

            {/* Inline Edit Form (when Edit Profile clicked) */}
            {editingProfile && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setSavingProfile(true);
                  setError(null);
                  setMessage(null);
                  try {
                    const res = await fetch("/api/customer-app", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        action: "UPDATE_PROFILE",
                        name: profileName,
                        phone: profilePhone,
                        email: profileEmail,
                        address: profileAddress,
                        gstNumber: profileGst,
                      }),
                    });
                    const data = await res.json();
                    if (!res.ok || !data.ok) {
                      setError(data.error || "Failed to update profile");
                    } else {
                      setCustomer(data.customer);
                      setEditingProfile(false);
                      setMessage("Profile updated.");
                    }
                  } finally {
                    setSavingProfile(false);
                  }
                }}
                className="bg-white border border-stone-200/90 rounded-2xl p-5 shadow-2xs space-y-3 text-xs"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-stone-700 mb-1">
                      Name / Showroom Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                      placeholder="e.g. Subham Jewellers"
                      className="w-full px-3 py-2 border border-stone-200 rounded-xl bg-stone-50/50 focus:bg-white focus:outline-none focus:border-[#0F3D2E]"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-stone-700 mb-1">
                      Phone Number
                    </label>
                    <input
                      type="tel"
                      value={profilePhone}
                      onChange={(e) => setProfilePhone(e.target.value)}
                      placeholder="e.g. 9876543210"
                      className="w-full px-3 py-2 border border-stone-200 rounded-xl bg-stone-50/50 focus:bg-white focus:outline-none focus:border-[#0F3D2E] font-mono"
                    />
                  </div>
                    <div>
                      <label className="block font-semibold text-stone-700 mb-1">
                        Email
                      </label>
                      <input
                        type="email"
                        value={profileEmail}
                        onChange={(e) => setProfileEmail(e.target.value)}
                        placeholder="e.g. name@example.com"
                        className="w-full px-3 py-2 border border-stone-200 rounded-xl bg-stone-50/50 focus:bg-white focus:outline-none focus:border-[#0F3D2E]"
                      />
                    </div>
                  </div>
                <div>
                  <label className="block font-semibold text-stone-700 mb-1">
                    Showroom / Delivery Address
                  </label>
                  <input
                    type="text"
                    value={profileAddress}
                    onChange={(e) => setProfileAddress(e.target.value)}
                    placeholder="Shop / Street / City"
                    className="w-full px-3 py-2 border border-stone-200 rounded-xl bg-stone-50/50 focus:bg-white focus:outline-none focus:border-[#0F3D2E]"
                  />
                </div>
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="w-full py-2.5 bg-[#0F3D2E] hover:bg-[#14533E] disabled:opacity-50 text-white rounded-xl font-semibold cursor-pointer"
                >
                  {savingProfile ? "Saving..." : "Save Profile"}
                </button>
              </form>
            )}

            {/* Grouped Quick Menu Rows */}
            <div className="bg-white border border-stone-200/90 rounded-2xl divide-y divide-stone-100 shadow-2xs text-xs overflow-hidden">
              <button
                type="button"
                onClick={() => setTab("ORDERS")}
                className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-stone-50 cursor-pointer"
              >
                <span className="flex items-center gap-3 font-medium text-stone-800">
                  <FileText className="w-4 h-4 text-[#0F3D2E]" />
                  My Orders ({requests.length})
                </span>
                <ChevronRight className="w-4 h-4 text-stone-400" />
              </button>
              <button
                type="button"
                onClick={() => setTab("CUSTOM")}
                className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-stone-50 cursor-pointer"
              >
                <span className="flex items-center gap-3 font-medium text-stone-800">
                  <Sparkles className="w-4 h-4 text-[#9E7C42]" />
                  Upload Custom Design
                </span>
                <ChevronRight className="w-4 h-4 text-stone-400" />
              </button>
              <button
                type="button"
                onClick={() => setTab("NOTIFICATIONS")}
                className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-stone-50 cursor-pointer"
              >
                <span className="flex items-center gap-3 font-medium text-stone-800">
                  <Bell className="w-4 h-4 text-[#0F3D2E]" />
                  Order Updates {unreadCount > 0 ? `(${unreadCount} new)` : ""}
                </span>
                <ChevronRight className="w-4 h-4 text-stone-400" />
              </button>
            </div>

            <div className="bg-white border border-stone-200/90 rounded-2xl divide-y divide-stone-100 shadow-2xs text-xs overflow-hidden">
              <button
                type="button"
                onClick={() => setEditingProfile(true)}
                className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-stone-50 cursor-pointer"
              >
                <span className="flex items-center gap-3 font-medium text-stone-800">
                  <Phone className="w-4 h-4 text-stone-500" />
                  Phone: <span className="font-mono">{customer?.phone || "Add phone"}</span>
                </span>
                <ChevronRight className="w-4 h-4 text-stone-400" />
              </button>
              <button
                type="button"
                onClick={() => void handleLogout()}
                className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-red-50/50 text-red-700 cursor-pointer"
              >
                <span className="flex items-center gap-3 font-medium">
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </span>
                <ChevronRight className="w-4 h-4 text-red-300" />
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Luxury Studio Product Detail Modal */}
      {selectedDesign && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] flex items-center justify-center p-2 sm:p-4">
          <div className="bg-slate-50 rounded-2xl max-w-5xl w-full max-h-[92vh] overflow-y-auto p-4 sm:p-6 shadow-2xl border border-stone-200">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-stone-200/80">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-semibold text-stone-500 uppercase tracking-wider">
                  {selectedDesign.categoryName}
                </span>
                <span className="text-stone-300">•</span>
                <span className="font-mono text-stone-500">{selectedDesign.code}</span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDesign(null)}
                className="p-1.5 rounded-full bg-white border border-stone-200 text-stone-500 hover:text-stone-900 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              {/* Left + Center: Vertical Thumbnail Rail & White Studio Stage */}
              <div className="lg:col-span-8 flex flex-col-reverse sm:flex-row gap-3">
                {galleryPhotos.length > 1 && (
                  <div className="flex sm:flex-col gap-2 overflow-x-auto sm:overflow-y-auto sm:max-h-[460px] shrink-0 pb-1 sm:pb-0">
                    {galleryPhotos.map((src, idx) => (
                      <button
                        key={`${src}-${idx}`}
                        type="button"
                        onClick={() => setActivePhotoIndex(idx)}
                        className={`w-16 h-16 rounded-xl overflow-hidden bg-white border-2 cursor-pointer shrink-0 transition-all ${
                          activePhotoIndex === idx
                            ? "border-amber-600 shadow-xs"
                            : "border-stone-200 opacity-80 hover:opacity-100"
                        }`}
                      >
                        <img
                          src={src}
                          alt={`View ${idx + 1}`}
                          className="w-full h-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                )}

                <div className="flex-1 space-y-2">
                  <div className="relative aspect-square max-h-[480px] w-full rounded-2xl bg-white border border-stone-200 shadow-xs overflow-hidden flex items-center justify-center">
                    {galleryPhotos[activePhotoIndex] ? (
                      <img
                        src={galleryPhotos[activePhotoIndex]}
                        alt={selectedDesign.name}
                        className="w-full h-full object-contain p-2 sm:p-4"
                      />
                    ) : (
                      <span className="text-xs text-stone-400">No Photo</span>
                    )}

                    {galleryPhotos.length > 1 && (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            setActivePhotoIndex((i) =>
                              i === 0 ? galleryPhotos.length - 1 : i - 1
                            )
                          }
                          aria-label="Previous photo"
                          className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/95 border border-stone-200 shadow-sm flex items-center justify-center text-stone-700 hover:bg-stone-50 cursor-pointer"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setActivePhotoIndex((i) =>
                              i === galleryPhotos.length - 1 ? 0 : i + 1
                            )
                          }
                          aria-label="Next photo"
                          className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/95 border border-stone-200 shadow-sm flex items-center justify-center text-stone-700 hover:bg-stone-50 cursor-pointer"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>

                  <div className="flex items-center justify-between px-1 text-xs">
                    <div>
                      <div className="font-semibold text-stone-800">
                        {activePhotoIndex === 0
                          ? "Primary Studio View"
                          : `Angle View ${activePhotoIndex + 1}`}
                      </div>
                      <div className="text-[11px] text-amber-700">
                        Use arrows or thumbnails to inspect details
                      </div>
                    </div>
                    {galleryPhotos.length > 0 && (
                      <span className="px-2.5 py-1 rounded-full bg-white border border-stone-200 font-mono text-[11px] text-stone-600">
                        {activePhotoIndex + 1} / {galleryPhotos.length}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Right: Floating White Details & Selection Card */}
              <div className="lg:col-span-4 bg-white rounded-2xl border border-stone-200 shadow-sm p-5 space-y-4 text-xs">
                <div>
                  <h2 className="text-lg font-bold text-stone-900 leading-snug">
                    {selectedDesign.name}
                  </h2>
                  <div className="text-[11px] text-stone-500 mt-1">
                    Approx Weight:{" "}
                    <span className="font-mono font-semibold text-stone-800">
                      {selectedDesign.approxWeightMin || "?"} –{" "}
                      {selectedDesign.approxWeightMax || "?"} g
                    </span>
                  </div>
                </div>

                {/* Choose Karat / Purity */}
                <div className="space-y-1.5">
                  <div className="text-[11px] font-bold text-stone-500 uppercase tracking-wider">
                    Choose Karat / Purity
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {orderPurities.map((p) => {
                      const activeId =
                        modalPurityId ||
                        selectedDesign.supportedPurityIds[0] ||
                        orderPurities[0]?.id ||
                        "";
                      const isActive = activeId === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setModalPurityId(p.id);
                            setModalCustomPurity("");
                          }}
                          className={`p-2 rounded-xl border text-left transition-all cursor-pointer ${
                            isActive
                              ? "border-amber-600 bg-amber-50/40 text-stone-900 font-semibold shadow-2xs"
                              : "border-stone-200 bg-white text-stone-600 hover:border-stone-300"
                          }`}
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="w-3 h-3 rounded-full bg-gradient-to-br from-amber-300 to-amber-600 border border-amber-700/30 shrink-0" />
                            <span className="truncate">{p.displayLabel}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Choose Size */}
                {selectedDesign.supportedSizes.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-bold text-stone-500 uppercase tracking-wider">
                      Available Sizes
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedDesign.supportedSizes.map((sz) => {
                        const activeSz =
                          modalSize || selectedDesign.supportedSizes[0] || "";
                        const isActive = activeSz === sz;
                        return (
                          <button
                            key={sz}
                            type="button"
                            onClick={() => setModalSize(sz)}
                            className={`px-2.5 py-1 rounded-lg border font-mono cursor-pointer ${
                              isActive
                                ? "border-stone-900 bg-stone-900 text-white font-semibold"
                                : "border-stone-200 bg-white text-stone-700 hover:bg-stone-50"
                            }`}
                          >
                            {sz}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {selectedDesign.description && (
                  <p className="text-stone-600 leading-relaxed border-t border-stone-100 pt-3">
                    {selectedDesign.description}
                  </p>
                )}

                <button
                  type="button"
                  onClick={() =>
                    addCatalogueDesignToCart(
                      selectedDesign,
                      modalPurityId || selectedDesign.supportedPurityIds[0] || orderPurities[0]?.id,
                      modalSize || selectedDesign.supportedSizes[0]
                    )
                  }
                  className="w-full py-3 bg-[#0F3D2E] hover:bg-[#14533E] text-white rounded-xl font-semibold text-sm cursor-pointer transition-colors"
                >
                  Add to Order Cart
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {cancelModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl border border-stone-200">
            <div className="flex items-start gap-3">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                  cancelModal.mode === "DELETE"
                    ? "bg-red-50 text-red-600 border border-red-200"
                    : "bg-amber-50 text-amber-700 border border-amber-200"
                }`}
              >
                {cancelModal.mode === "DELETE" ? (
                  <Trash2 className="w-5 h-5" />
                ) : (
                  <X className="w-5 h-5" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-serif text-base font-semibold text-stone-900">
                  {cancelModal.mode === "DELETE"
                    ? `Cancel Order ${cancelModal.requestNumber}?`
                    : `Request Cancellation`}
                </h3>
                <p className="text-xs text-stone-500 mt-0.5 leading-relaxed">
                  {cancelModal.mode === "DELETE"
                    ? "This order has not been approved yet. Cancelling will remove it immediately."
                    : `Order ${cancelModal.requestNumber} is already approved by AM Jewellery. Send a cancellation request to the manager:`}
                </p>
              </div>
            </div>

            {cancelModal.mode === "REQUEST_CANCEL" && (
              <div className="space-y-2.5">
                <div className="flex flex-wrap gap-1.5">
                  {[
                    "Ordered by mistake",
                    "Need different size / weight",
                    "Change in delivery date",
                  ].map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => setCancelReason(chip)}
                      className={`px-2.5 py-1 rounded-full text-[11px] border cursor-pointer transition-colors ${
                        cancelReason === chip
                          ? "bg-[#0F3D2E] text-white border-[#0F3D2E]"
                          : "bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-100"
                      }`}
                    >
                      {chip}
                    </button>
                  ))}
                </div>
                <textarea
                  rows={2}
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Enter reason for cancellation..."
                  className="w-full px-3 py-2 text-xs border border-stone-200 rounded-xl bg-stone-50/60 focus:bg-white focus:outline-none focus:border-[#0F3D2E]"
                />
              </div>
            )}

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                disabled={submittingCancel}
                onClick={() => setCancelModal(null)}
                className="flex-1 py-2.5 px-4 rounded-xl border border-stone-200 text-stone-700 text-xs font-semibold hover:bg-stone-50 cursor-pointer"
              >
                Keep Order
              </button>
              <button
                type="button"
                disabled={submittingCancel}
                onClick={() => void confirmCancelModal()}
                className={`flex-1 py-2.5 px-4 rounded-xl text-white text-xs font-semibold cursor-pointer transition-colors ${
                  cancelModal.mode === "DELETE"
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-[#0F3D2E] hover:bg-[#14533E]"
                }`}
              >
                {submittingCancel
                  ? "Sending..."
                  : cancelModal.mode === "DELETE"
                  ? "Yes, Cancel Order"
                  : "Send Request"}
              </button>
            </div>
          </div>
        </div>
      )}

      {viewingBillHtml && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-auto p-4 space-y-3">
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="px-3 py-1 bg-stone-900 text-white text-xs rounded-lg font-medium"
              >
                Print
              </button>
              <button
                type="button"
                onClick={() => setViewingBillHtml(null)}
                className="px-3 py-1 border border-stone-200 text-xs rounded-lg font-medium"
              >
                Close
              </button>
            </div>
            <div dangerouslySetInnerHTML={{ __html: viewingBillHtml }} />
          </div>
        </div>
      )}

      {orderSuccessNumber && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 sm:p-7 text-center space-y-4 shadow-2xl border border-[#9E7C42]/30">
            <div className="relative w-20 h-20 mx-auto flex items-center justify-center">
              <span className="absolute inset-0 rounded-full bg-emerald-200/60 animate-ping" />
              <div className="relative w-16 h-16 rounded-full bg-[#0F3D2E] text-white flex items-center justify-center shadow-md">
                <CheckCircle2 className="w-8 h-8 text-[#E6C27A]" />
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="inline-block px-3 py-1 rounded-full bg-[#FAF9F6] border border-[#9E7C42]/40 font-mono text-xs font-semibold text-[#9E7C42]">
                {orderSuccessNumber}
              </div>
              <h2 className="font-serif text-xl font-semibold text-[#0F3D2E]">
                Thank You! Order Received
              </h2>
              <p className="text-xs text-stone-500 leading-relaxed">
                Your AM Jewellery order has been sent to our master craftsmen. We will keep you updated at every step.
              </p>
            </div>
            <div className="flex flex-col gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setOrderSuccessNumber(null);
                  setTab("ORDERS");
                }}
                className="w-full py-2.5 rounded-xl bg-[#0F3D2E] hover:bg-[#14533E] text-white text-xs font-semibold cursor-pointer"
              >
                Track My Order
              </button>
              <button
                type="button"
                onClick={() => {
                  setOrderSuccessNumber(null);
                  setTab("DESIGNS");
                }}
                className="w-full py-2.5 rounded-xl border border-stone-200 hover:bg-stone-50 text-stone-700 text-xs font-medium cursor-pointer"
              >
                Back to Home
              </button>
            </div>
          </div>
        </div>
      )}

      {previewOrderPhoto && (
        <div
          onClick={() => setPreviewOrderPhoto(null)}
          className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
        >
          <div className="relative max-w-lg w-full bg-white rounded-2xl p-2 shadow-2xl">
            <button
              type="button"
              onClick={() => setPreviewOrderPhoto(null)}
              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/70 text-white flex items-center justify-center cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
            <img
              src={previewOrderPhoto}
              alt="Order item"
              className="w-full max-h-[75vh] object-contain rounded-xl"
            />
          </div>
        </div>
      )}

      {message && (
        <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 max-w-[90vw] bg-[#0F3D2E] text-white px-4 py-2.5 rounded-full shadow-xl border border-[#9E7C42]/40 flex items-center gap-2 text-xs font-medium">
          <CheckCircle2 className="w-4 h-4 text-[#E6C27A] shrink-0" />
          <span className="truncate">{message}</span>
        </div>
      )}

      {/* Mobile Bottom App Navigation */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur border-t border-stone-200 px-2 py-1.5 flex items-center justify-around text-[11px]">
        {(
          [
            ["DESIGNS", "Home", ShoppingBag, 0],
            ["CUSTOM", "Custom", Sparkles, 0],
            ["CART", "Cart", ShoppingCart, cart.length],
            ["ORDERS", "Orders", FileText, 0],
            ["PROFILE", "Profile", User, 0],
          ] as const
        ).map(([key, label, Icon, badge]) => {
          const active = tab === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`relative flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl cursor-pointer ${
                active ? "text-[#0F3D2E] font-semibold" : "text-stone-500"
              }`}
            >
              <Icon className={`w-4 h-4 ${active ? "stroke-[2.2]" : ""}`} />
              <span>{label}</span>
              {badge > 0 && (
                <span className="absolute top-0.5 right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-[#0F3D2E] text-white text-[10px] font-bold flex items-center justify-center">
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
