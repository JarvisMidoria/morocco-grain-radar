"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Radar } from "lucide-react";
import { cn } from "@/lib/utils";

const primaryNavItems = [
  { href: "/", label: "Radar" },
  { href: "/opportunities", label: "Opportunities" },
  { href: "/vessels", label: "Vessels" },
  { href: "/favorites", label: "Favorites" },
  { href: "/settings", label: "Settings" },
];

const secondaryNavItems = [
  { href: "/validation", label: "Validation" },
  { href: "/performance", label: "Performance" },
  { href: "/knowledge", label: "Knowledge" },
  { href: "/market-context", label: "Market" },
  { href: "/risk", label: "Risk" },
  { href: "/operations", label: "Ops" },
  { href: "/jobs", label: "Jobs" },
  { href: "/ports", label: "Ports" },
  { href: "/analytics", label: "Analytics" },
];

export function TopNav() {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const secondaryActive = secondaryNavItems.some((item) => isActive(item.href));

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl flex-col items-start gap-3 px-4 py-4 lg:flex-row lg:items-center lg:justify-between sm:px-6 lg:px-8">
        <Link href="/" className="flex min-w-0 items-center gap-2 text-slate-900">
          <div className="rounded-lg bg-blue-600/10 p-2 text-blue-600">
            <Radar className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 sm:text-sm">
              Maritime Intel
            </div>
            <div className="truncate text-sm font-semibold sm:text-base">Morocco Grain Radar</div>
          </div>
        </Link>

        <nav className="flex w-full flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1 lg:w-auto lg:flex-nowrap lg:items-center">
          {primaryNavItems.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "min-w-0 rounded-lg px-2 py-2 text-center text-xs font-medium text-slate-600 transition-colors sm:px-3 sm:text-sm",
                  active ? "bg-blue-600 text-white" : "hover:bg-slate-100",
                )}
              >
                {item.label}
              </Link>
            );
          })}
          <details className="group relative">
            <summary
              className={cn(
                "flex cursor-pointer list-none items-center gap-1 rounded-lg px-2 py-2 text-xs font-medium text-slate-600 transition-colors marker:hidden hover:bg-slate-100 sm:px-3 sm:text-sm",
                secondaryActive ? "bg-slate-900 text-white hover:bg-slate-900" : "",
              )}
            >
              Analyst/Admin
              <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
            </summary>
            <div className="absolute right-0 z-50 mt-2 grid w-56 gap-1 rounded-xl border border-slate-200 bg-white p-2 shadow-lg shadow-slate-200/60">
              {secondaryNavItems.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100",
                      active ? "bg-blue-50 text-blue-700" : "",
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </details>
        </nav>
      </div>
    </header>
  );
}
