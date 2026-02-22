"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(href + "/");

  return (
    <Link
      href={href}
      className={`rounded-full px-3 py-1.5 text-sm transition ${
        active
          ? "bg-white/70 shadow-sm ring-1 ring-black/5 backdrop-blur"
          : "text-zinc-700 hover:bg-white/50 hover:text-zinc-900"
      }`}
    >
      {label}
    </Link>
  );
}

export default function TopNav() {
  return (
    <header className="sticky top-0 z-20 -mx-4 border-b border-black/5 bg-white/30 px-4 py-3 backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <Link href="/today" className="font-semibold tracking-tight">
          手帐 · MVP
        </Link>
        <nav className="flex items-center gap-2">
          <NavLink href="/today" label="今天" />
          <NavLink href="/timeline" label="时间轴" />
          <NavLink href="/calendar" label="日历" />
        </nav>
      </div>
    </header>
  );
}
