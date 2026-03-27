"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

type NavHref = "/" | "/study" | "/library" | "/progress";

const NAV_ITEMS = [
  { href: "/", label: "หน้าแรก" },
  { href: "/study", label: "ฝึกกฎหมาย" },
  { href: "/library", label: "คลังเนื้อหา" },
  { href: "/progress", label: "ความคืบหน้า" },
] as const;

function NavLink({ href, label, active }: { href: NavHref; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`rounded-full px-3 py-2 text-xs font-semibold transition sm:text-sm ${
        active ? "bg-indigo-300/90 text-slate-950 shadow-[0_8px_22px_rgba(176,198,255,0.3)]" : "text-slate-300 hover:bg-slate-800/80 hover:text-white"
      }`}
    >
      {label}
    </Link>
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#02054e] via-[#02054e] to-[#111560] text-slate-100">
      <div className="screen-aura" />
      <div className="mx-auto w-full max-w-5xl px-4 pb-28 pt-5 sm:px-6 lg:px-8">
        <header className="glass-panel sticky top-3 z-30 mb-6 flex items-center justify-between rounded-3xl border border-indigo-300/20 px-4 py-3 shadow-[0_8px_35px_rgba(10,16,70,0.35)]">
          <div className="flex items-center gap-2">
            <span className="text-lg leading-none text-indigo-200">✦</span>
            <p className="text-sm font-bold tracking-tight text-indigo-100 sm:text-base">ไทยนิติ Active Recall</p>
          </div>
          <nav className="hidden items-center gap-1 sm:flex">
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.href} href={item.href} label={item.label} active={pathname === item.href} />
            ))}
          </nav>
        </header>

        {children}

        <footer className="mt-10 text-center text-xs text-slate-400">© 2026 Thai Niti.</footer>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-20 rounded-t-[2.25rem] border-t border-indigo-300/20 bg-[#02054e]/85 p-3 shadow-[0_-8px_38px_rgba(0,0,0,0.35)] backdrop-blur-2xl sm:hidden">
        <div className="mx-auto grid max-w-md grid-cols-4 gap-2">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.href} href={item.href} label={item.label} active={pathname === item.href} />
          ))}
        </div>
      </nav>
    </main>
  );
}
