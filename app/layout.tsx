import type { Metadata } from "next";
import localFont from "next/font/local";
import { DataSourceIndicator } from "@/components/layout/data-source-indicator";
import { TopNav } from "@/components/layout/top-nav";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});

const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Morocco Grain Radar",
  description: "Maritime intelligence dashboard for probabilistic grain shipment tracking into Morocco.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} bg-slate-50 text-slate-900 antialiased`}>
        <TopNav />
        <DataSourceIndicator />
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </body>
    </html>
  );
}
