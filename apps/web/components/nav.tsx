"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/board", label: "Board" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/bank", label: "Bank" },
  { href: "/generate", label: "Paste" },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav aria-label="Primary" className="flex items-center gap-1 sm:gap-2">
      {LINKS.map(({ href, label }) => {
        const active = path === href || path.startsWith(`${href}/`) || (href === "/board" && path.startsWith("/applications"));
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`relative flex h-9 items-center px-2 text-[13px] transition-colors duration-150 sm:px-2.5 ${active ? "text-ink" : "text-ink-2 hover:text-ink"}`}
          >
            {label}
            {active && <span className="absolute inset-x-2 -bottom-px h-px bg-ink sm:inset-x-2.5" aria-hidden />}
          </Link>
        );
      })}
    </nav>
  );
}
