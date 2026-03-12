import type { Metadata } from "next";
import localFont from "next/font/local";
import { cookies } from "next/headers";
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
  const cookieStore = cookies();
  const themeCookie = cookieStore.get("radar_theme")?.value;
  const normalizedTheme =
    themeCookie === "light" || themeCookie === "dark" || themeCookie === "system"
      ? themeCookie
      : "system";
  const shouldForceDark = normalizedTheme === "dark";
  const themeBootstrapScript = `
    (function () {
      try {
        var theme = ${JSON.stringify(normalizedTheme)};
        var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        var isDark = theme === "dark" || (theme === "system" && prefersDark);
        document.documentElement.classList.toggle("dark", isDark);
      } catch (error) {}
    })();
  `;

  return (
    <html lang="en" suppressHydrationWarning className={shouldForceDark ? "dark" : undefined}>
      <body className={`${geistSans.variable} ${geistMono.variable} overflow-x-hidden bg-slate-50 text-slate-900 antialiased`}>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
        <TopNav />
        <DataSourceIndicator />
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </body>
    </html>
  );
}
