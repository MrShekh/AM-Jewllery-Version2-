import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "AM Jewellery — Customer App",
  description:
    "Browse AM Jewellery designs, upload custom orders, and track your orders & bills.",
  manifest: "/customer-manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "AM Jewellery",
    statusBarStyle: "default",
  },
  icons: {
    icon: "/am-logo-icon.png",
    apple: "/am-logo-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0F3D2E",
  width: "device-width",
  initialScale: 1,
};

export default function CustomerAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
