import type { WASocket } from "@whiskeysockets/baileys";
import path from "path";
import fs from "fs";
import os from "os";

export interface WhatsAppState {
  status: "disconnected" | "connecting" | "qr" | "connected";
  qrDataUrl: string | null;
  phone: string | null;
  connectedUser: string | null;
  isReady: boolean;
  lastError: string | null;
}

interface GlobalWhatsAppSingleton {
  sock: WASocket | null;
  state: WhatsAppState;
  initializing: boolean;
  initializingSince: number;
}

const globalForWa = globalThis as unknown as {
  __amJewelleryWaSingletonV3?: GlobalWhatsAppSingleton;
};

if (!globalForWa.__amJewelleryWaSingletonV3) {
  globalForWa.__amJewelleryWaSingletonV3 = {
    sock: null,
    state: {
      status: "disconnected",
      qrDataUrl: null,
      phone: null,
      connectedUser: null,
      isReady: false,
      lastError: null,
    },
    initializing: false,
    initializingSince: 0,
  };
}

const singleton = globalForWa.__amJewelleryWaSingletonV3;
const AUTH_DIR = process.env.VERCEL
  ? path.join(os.tmpdir(), "whatsapp-auth")
  : path.join(process.cwd(), "storage", "whatsapp-auth");

export async function ensureWhatsAppClient(forceReset = false): Promise<WhatsAppState> {
  if (forceReset) {
    try {
      singleton.sock?.end(undefined);
    } catch {
      // ignore
    }
    singleton.sock = null;
    singleton.initializing = false;
    singleton.initializingSince = 0;
    singleton.state = {
      status: "disconnected",
      qrDataUrl: null,
      phone: null,
      connectedUser: null,
      isReady: false,
      lastError: null,
    };
    if (fs.existsSync(AUTH_DIR)) {
      fs.rmSync(AUTH_DIR, { recursive: true, force: true });
    }
  }

  if (singleton.sock && (singleton.state.status === "connected" || singleton.state.status === "qr")) {
    return singleton.state;
  }

  if (singleton.initializing && Date.now() - singleton.initializingSince < 15000) {
    return singleton.state;
  }

  singleton.initializing = true;
  singleton.initializingSince = Date.now();
  singleton.state.status = "connecting";
  singleton.state.lastError = null;

  try {
    const baileys: any = await import("@whiskeysockets/baileys");
    const makeWASocket = baileys.makeWASocket || baileys.default;
    const { DisconnectReason, fetchLatestBaileysVersion, useMultiFileAuthState } = baileys;
    const qrMod: any = await import("qrcode");
    const QRCode = qrMod.default || qrMod;
    const pinoMod: any = await import("pino");
    const pino = pinoMod.default || pinoMod;

    fs.mkdirSync(AUTH_DIR, { recursive: true });
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

    let version: [number, number, number] = [2, 3000, 1043857760];
    try {
      const latest = await fetchLatestBaileysVersion();
      if (latest?.version) {
        version = latest.version;
      }
    } catch {
      // fallback to known good version if offline
    }

    const sock: WASocket = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: "silent" }),
      browser: ["AM Jewellery ERP", "Chrome", "2.0.0"],
      syncFullHistory: false,
      markOnlineOnConnect: false,
    });

    singleton.sock = sock;

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update: any) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          const dataUrl = await QRCode.toDataURL(qr, { margin: 2, width: 280 });
          singleton.state.status = "qr";
          singleton.state.qrDataUrl = dataUrl;
          singleton.state.isReady = false;
          singleton.initializing = false;
        } catch (qrErr: any) {
          singleton.state.lastError = qrErr?.message || "QR generation error";
        }
      }

      if (connection === "open") {
        const rawId = sock.user?.id || "";
        const phoneNum = rawId.split(":")[0]?.split("@")[0] || "Connected";
        singleton.state = {
          status: "connected",
          qrDataUrl: null,
          phone: phoneNum,
          connectedUser: phoneNum,
          isReady: true,
          lastError: null,
        };
        singleton.initializing = false;
      }

      if (connection === "close") {
        const statusCode = (
          lastDisconnect?.error as { output?: { statusCode?: number } } | undefined
        )?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        singleton.sock = null;
        singleton.initializing = false;

        if (!shouldReconnect) {
          if (fs.existsSync(AUTH_DIR)) {
            fs.rmSync(AUTH_DIR, { recursive: true, force: true });
          }
          singleton.state = {
            status: "disconnected",
            qrDataUrl: null,
            phone: null,
            connectedUser: null,
            isReady: false,
            lastError: "Logged out from WhatsApp. Scan QR code to reconnect.",
          };
        } else {
          singleton.state.status = "connecting";
          singleton.state.isReady = false;
          setTimeout(() => {
            void ensureWhatsAppClient(false);
          }, 2000);
        }
      }
    });

    // Wait up to 5 seconds for QR code or open connection so the very first response already includes qrDataUrl
    const startWait = Date.now();
    while (
      singleton.state.status === "connecting" &&
      !singleton.state.qrDataUrl &&
      !singleton.state.isReady &&
      Date.now() - startWait < 5000
    ) {
      await new Promise((r) => setTimeout(r, 200));
    }
  } catch (err) {
    singleton.initializing = false;
    singleton.state.status = "disconnected";
    singleton.state.lastError = err instanceof Error ? err.message : "Failed to initialize WhatsApp";
  }

  return singleton.state;
}

export function getWhatsAppState(): WhatsAppState {
  if (
    singleton.state.status === "disconnected" &&
    !singleton.initializing &&
    !singleton.state.lastError &&
    fs.existsSync(path.join(AUTH_DIR, "creds.json"))
  ) {
    void ensureWhatsAppClient(false);
  }
  return singleton.state;
}

export async function sendBillPdfViaWhatsApp(params: {
  phone: string;
  customerName: string;
  billNumber: string;
  pdfBase64: string;
}): Promise<{ ok: true; phone: string }> {
  let cleaned = (params.phone || "").replace(/\D/g, "");
  if (!cleaned) {
    throw new Error(`Customer "${params.customerName}" does not have a phone number saved.`);
  }
  if (cleaned.startsWith("0")) {
    cleaned = "91" + cleaned.slice(1);
  }
  if (cleaned.length === 10) {
    cleaned = "91" + cleaned;
  }

  // First check if external WHATSAPP_SERVICE_URL (like http://localhost:5001 in gold-billing / V1) is configured and ready
  const externalServiceUrl = process.env.WHATSAPP_SERVICE_URL;
  if (externalServiceUrl) {
    try {
      const extRes = await fetch(`${externalServiceUrl}/send-bill`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: cleaned,
          customerName: params.customerName || "Customer",
          billNumber: params.billNumber,
          pdfBuffer: params.pdfBase64,
        }),
      });
      if (extRes.ok) {
        return { ok: true, phone: cleaned };
      }
    } catch {
      // Fall back to built-in WhatsApp socket
    }
  }

  if (!singleton.sock || !singleton.state.isReady) {
    await ensureWhatsAppClient(false);
  }

  if (!singleton.sock || !singleton.state.isReady) {
    throw new Error("WhatsApp is not connected yet. Please scan the QR code first.");
  }

  let targetJid = `${cleaned}@s.whatsapp.net`;
  try {
    const results = await singleton.sock.onWhatsApp(cleaned);
    if (results && results.length > 0 && results[0]?.jid) {
      targetJid = results[0].jid;
    }
  } catch {
    // Use standard @s.whatsapp.net JID
  }

  const pdfBuffer = Buffer.from(params.pdfBase64, "base64");
  const safeName = (params.customerName || "Customer").replace(/[^a-zA-Z0-9_-]/g, "_");
  const fileName = `Bill_${params.billNumber}_${safeName}.pdf`;

  const caption =
    `✨ *AM Jewellery* ✨\n\n` +
    `Hello *${params.customerName || "Valued Customer"}*,\n` +
    `Thank you for your business! 🙏\n\n` +
    `Please find attached the PDF invoice for your recent order (Bill No: *${params.billNumber}*).\n\n` +
    `Best Regards,\n` +
    `*AM Jewellery*`;

  await singleton.sock.sendMessage(targetJid, {
    document: pdfBuffer,
    mimetype: "application/pdf",
    fileName,
    caption,
  });

  return { ok: true, phone: cleaned };
}
