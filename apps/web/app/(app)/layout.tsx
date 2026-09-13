import Link from "next/link";
import { Nav } from "@/components/nav";
import { ThemePicker } from "@/components/theme";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-hair bg-paper/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-5 sm:px-8">
          <Link href="/board" className="display text-[22px] leading-none" aria-label="Shortlisted home">
            Shortlisted<span className="text-accent">.</span>
          </Link>
          <Nav />
          <div className="ml-auto">
            <ThemePicker />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-10">{children}</main>
    </div>
  );
}
