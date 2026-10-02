"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, LayoutDashboard, Leaf } from "lucide-react";

const tabs = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/plan", label: "Plan", icon: CalendarDays },
];

export default function AppNav() {
  const pathname = usePathname();

  return (
    <div className="sticky top-0 z-40 border-b border-emerald-200/8 bg-[#07110d]/88 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-4 py-3 md:px-7">
        <Link href="/" className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-400 text-emerald-950">
            <Leaf size={19} />
          </div>
          <div className="hidden sm:block">
            <p className="text-sm font-semibold leading-none">AGRO CONNECT</p>
            <p className="mt-1 text-[10px] uppercase tracking-[.18em] text-white/30">Smart Farming</p>
          </div>
        </Link>

        <nav className="flex items-center rounded-2xl border border-white/8 bg-white/[.035] p-1">
          {tabs.map((tab) => {
            const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm transition ${
                  active
                    ? "bg-emerald-400 text-emerald-950 shadow-[0_7px_25px_rgba(37,199,102,.18)]"
                    : "text-white/48 hover:bg-white/5 hover:text-white/80"
                }`}
              >
                <Icon size={16} />
                <span>{tab.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
