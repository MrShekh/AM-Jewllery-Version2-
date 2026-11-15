import { NextRequest, NextResponse } from "next/server";
import os from "os";
import { execFile } from "child_process";
import {
  getLatestQrScanEvent,
  globalForQrBridge,
  recordQrScanRelay,
  type QrScanBridgeEvent,
} from "@/lib/qr-bridge";

export type { QrScanBridgeEvent };

function isPrivateLanIpv4(address: string): boolean {
  if (address.startsWith("192.168.") || address.startsWith("10.")) {
    return true;
  }
  if (address.startsWith("172.")) {
    const secondOctet = Number(address.split(".")[1]);
    return secondOctet >= 16 && secondOctet <= 31;
  }
  return false;
}

function getLanIpAddress(): string | null {
  const interfaces = os.networkInterfaces();
  const candidates: { address: string; priority: number }[] = [];

  for (const name of Object.keys(interfaces)) {
    const netList = interfaces[name];
    if (!netList) continue;
    const lowerName = name.toLowerCase();

    // Skip virtual, tunnel, and link-local adapters
    if (
      lowerName.includes("vethernet") ||
      lowerName.includes("wsl") ||
      lowerName.includes("docker") ||
      lowerName.includes("vmware") ||
      lowerName.includes("vbox") ||
      lowerName.includes("virtual") ||
      lowerName.includes("tailscale") ||
      lowerName.includes("loopback")
    ) {
      continue;
    }

    for (const net of netList) {
      if (net.family === "IPv4" && !net.internal) {
        // Never return APIPA/link-local (169.254.x.x) or non-LAN IPs
        if (net.address.startsWith("169.254.") || !isPrivateLanIpv4(net.address)) {
          continue;
        }
        let priority = 3;
        if (lowerName.includes("wi-fi") || lowerName.includes("wlan")) {
          priority = 1;
        } else if (lowerName.includes("ethernet") || lowerName.includes("eth")) {
          priority = 2;
        }
        if (net.address.startsWith("192.168.") || net.address.startsWith("10.")) {
          priority -= 0.5;
        }
        candidates.push({ address: net.address, priority });
      }
    }
  }

  candidates.sort((a, b) => a.priority - b.priority);
  return candidates.length > 0 ? candidates[0].address : null;
}

export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get("client") === "laptop") {
    globalForQrBridge.lastLaptopPollAt = Date.now();
  }

  const hostHeader =
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    "localhost:3001";
  const hostnameOnly = hostHeader.split(":")[0].toLowerCase();
  const isLocalHost =
    hostnameOnly === "localhost" ||
    hostnameOnly === "127.0.0.1" ||
    isPrivateLanIpv4(hostnameOnly);
  const proto =
    request.headers.get("x-forwarded-proto") ||
    (isLocalHost ? "http" : "https");

  let lanBaseUrl = `${proto}://${hostHeader}`;
  if (
    !process.env.VERCEL &&
    (hostnameOnly === "localhost" || hostnameOnly === "127.0.0.1")
  ) {
    const lanIp = getLanIpAddress();
    if (lanIp) {
      const port = hostHeader.includes(":") ? hostHeader.split(":")[1] : "3001";
      lanBaseUrl = `http://${lanIp}:${port}`;
    }
  }

  const latestScan = await getLatestQrScanEvent();

  return NextResponse.json({
    ok: true,
    lanBaseUrl,
    latestScan,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const rawTarget = String(body.target || body.orderId || "").trim();
    const result = await recordQrScanRelay(rawTarget);

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: result.status }
      );
    }

    const { event } = result;
    const hasActiveLaptopTab = Boolean(
      globalForQrBridge.lastLaptopPollAt &&
        Date.now() - globalForQrBridge.lastLaptopPollAt < 4000
    );

    let openedNewTab = false;
    if (!hasActiveLaptopTab && process.platform === "win32") {
      const hostHeader = request.headers.get("host") || "localhost:3001";
      const port = hostHeader.includes(":") ? hostHeader.split(":")[1] : "3001";
      const laptopUrl = `http://localhost:${port}/production-register?order=${encodeURIComponent(
        event.orderId
      )}&scanned=${encodeURIComponent(event.scanId)}`;
      execFile("cmd.exe", ["/c", "start", "", laptopUrl], (err) => {
        if (err) {
          console.error("Failed to open laptop browser tab:", err);
        }
      });
      openedNewTab = true;
    }

    return NextResponse.json({
      ok: true,
      event,
      openedNewTab,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Failed to relay QR scan",
      },
      { status: 500 }
    );
  }
}
