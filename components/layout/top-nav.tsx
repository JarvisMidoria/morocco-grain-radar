"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Radar } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Dashboard" },
  { href: "/vessels", label: "Vessels" },
  { href: "/ports", label: "Ports" },
  { href: "/analytics", label: "Analytics" },
  { href: "/settings", label: "Settings" },
];

export function TopNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl flex-col items-start gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
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

        <nav className="grid w-full grid-cols-5 gap-1 rounded-xl border border-slate-200 p-1 sm:flex sm:w-auto sm:items-center">
          {navItems.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
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
        </nav>
      </div>
    </header>
  );
}
