import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const pixelFont = Geist_Mono({
  variable: "--font-pixel",
  subsets: ["latin"],
});

const bodyFont = Geist({
  variable: "--font-body",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PM Simulator — BazaarLoop",
  description: "A gamified, AI-powered simulation of Day 1 as a PM at a marketplace startup, working a live payments incident.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${pixelFont.variable} ${bodyFont.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
