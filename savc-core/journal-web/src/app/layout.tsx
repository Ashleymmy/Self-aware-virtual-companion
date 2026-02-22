import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "手帐 · MVP",
  description: "本地优先的网页手帐：日常记录与快速回顾",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[radial-gradient(900px_circle_at_20%_0%,rgba(251,191,36,0.20),transparent_55%),radial-gradient(1100px_circle_at_90%_10%,rgba(244,114,182,0.10),transparent_55%),radial-gradient(900px_circle_at_50%_90%,rgba(34,197,94,0.10),transparent_60%)] text-zinc-900`}
      >
        <div className="min-h-dvh">
          {children}
        </div>
      </body>
    </html>
  );
}
