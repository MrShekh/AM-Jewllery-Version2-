import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AM Jewellery ERP | Production Register, Bullion & Billing",
  description:
    "AM Jewellery Gold Manufacturing ERP - Append-only PostgreSQL journal, spreadsheet register, and custom billing.",
  icons: {
    icon: "/am-logo-icon.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900">
        {children}
      </body>
    </html>
  );
}

