import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/Nav";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Office World Cup 2026 Pool",
  description: "Predict the 2026 FIFA World Cup and climb the office leaderboard.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <Nav />
        <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-6">{children}</main>
        <footer className="border-t border-slate-200 py-5 text-center text-xs text-slate-400">
          Office World Cup 2026 Pool · 11 Jun – 19 Jul 2026 · 🇨🇦 🇲🇽 🇺🇸
        </footer>
      </body>
    </html>
  );
}
