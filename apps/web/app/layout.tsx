import type { Metadata } from "next";
import localFont from "next/font/local";
import { cookies } from "next/headers";
import { ACCENT_COOKIE, MODE_COOKIE, isAccent, isMode } from "@/components/theme-config";
import "./globals.css";

const geist = localFont({ src: "./fonts/geist.woff2", variable: "--font-geist", weight: "100 900", display: "swap" });
const geistMono = localFont({ src: "./fonts/geist-mono.woff2", variable: "--font-geist-mono", weight: "100 900", display: "swap" });
const instrument = localFont({
  src: [
    { path: "./fonts/instrument-serif.woff2", weight: "400", style: "normal" },
    { path: "./fonts/instrument-serif-italic.woff2", weight: "400", style: "italic" },
  ],
  variable: "--font-instrument",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Shortlisted", template: "%s · Shortlisted" },
  description: "One-click tailored resumes and a pipeline from Saved to Offer.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Theme lives in two cookies so the server renders the right one. System
  // mode is the absence of data-mode; CSS light-dark() handles it.
  const store = await cookies();
  const mode = store.get(MODE_COOKIE)?.value;
  const accent = store.get(ACCENT_COOKIE)?.value;
  return (
    <html
      lang="en"
      className={`${geist.variable} ${geistMono.variable} ${instrument.variable}`}
      data-mode={isMode(mode) && mode !== "system" ? mode : undefined}
      data-accent={isAccent(accent) ? accent : "persimmon"}
    >
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
