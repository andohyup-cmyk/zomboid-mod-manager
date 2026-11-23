"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const navigation = [
  { href: "/dashboard", label: "홈", short: "홈" },
  { href: "/mods", label: "모드 카탈로그", short: "모드" },
  { href: "/register", label: "모드 등록", short: "등록" },
  { href: "/profiles", label: "서버 프로필", short: "서버" }
];

function PendingDot() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <span
      aria-hidden="true"
      className="ml-1.5 inline-block h-1.5 w-1.5 animate-ping rounded-full bg-[#8fcb85]"
    />
  );
}

function NavLink({ href, label, compact }: { href: string; label: string; compact?: boolean }) {
  const pathname = usePathname();
  const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href + "/"));
  return (
    <Link
      href={href}
      prefetch
      aria-current={active ? "page" : undefined}
      className={
        "flex items-center justify-center rounded-xl text-sm font-semibold transition-colors md:justify-start " +
        (compact ? "min-h-12 flex-col gap-1 px-2 py-1.5 text-xs " : "px-3 py-3 text-left ") +
        (active
          ? "bg-[#294535] text-[#b9efb0]"
          : "text-[#9baebe] active:bg-[#1b2a39] hover:bg-[#1b2a39] hover:text-white")
      }
    >
      <span className="inline-flex items-center">
        {compact ? navigation.find((item) => item.href === href)?.short : label}
        <PendingDot />
      </span>
      {compact && (
        <span
          aria-hidden="true"
          className={`h-1 w-4 rounded-full ${active ? "bg-[#8fcb85]" : "bg-transparent"}`}
        />
      )}
    </Link>
  );
}

export function AppShell({ children, email }: { children: ReactNode; email?: string }) {
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[250px_minmax(0,1fr)]">
      <aside className="hidden min-h-dvh flex-col border-r border-[#304154] bg-[#101824] p-6 md:flex">
        <Link href="/dashboard" className="mb-9 block">
          <div className="kicker">BUILD 42.22</div>
          <div className="mt-2 text-2xl font-black tracking-tight">PZ MODS</div>
          <div className="muted mt-1 text-xs">Zomboid Mod Manager</div>
        </Link>
        <nav aria-label="주 메뉴" className="flex flex-col gap-2">
          {navigation.map((item) => <NavLink key={item.href} {...item} />)}
        </nav>
        <div className="mt-auto pt-8">
          <p className="muted mb-2 truncate text-xs" title={email}>{email}</p>
          <form action="/logout" method="post">
            <button type="submit" className="secondary-action w-full text-sm">로그아웃</button>
          </form>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="flex items-center justify-between border-b border-[#304154] px-5 py-4 md:hidden">
          <Link href="/dashboard" className="text-lg font-black tracking-wide">PZ MODS</Link>
          <span className="kicker">B42.22</span>
        </header>
        <main className="mx-auto w-full max-w-5xl px-4 pb-32 pt-6 sm:px-7 md:pb-12 md:pt-10">
          {children}
        </main>
      </div>

      <nav aria-label="모바일 주 메뉴" className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 gap-1 border-t border-[#304154] bg-[#101824]/95 px-2 pb-[max(10px,env(safe-area-inset-bottom))] pt-2 backdrop-blur md:hidden">
        {navigation.map((item) => <NavLink key={item.href} {...item} compact />)}
      </nav>
    </div>
  );
}
