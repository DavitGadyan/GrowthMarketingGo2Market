import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const displayFont = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-display-loaded", display: "swap" });
const bodyFont = Geist({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-body-loaded", display: "swap" });
const monoFont = Geist_Mono({ subsets: ["latin"], weight: ["400"], variable: "--font-mono-loaded", display: "swap" });

export const metadata: Metadata = {
  title: "GrowthPilot",
  description: "AI growth-marketing and go-to-market agents: research, plan, approve, execute.",
  openGraph: {
    title: "GrowthPilot",
    description: "AI growth-marketing and go-to-market agents: research, plan, approve, execute.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#F5F5F7",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${displayFont.variable} ${bodyFont.variable} ${monoFont.variable}`}>
      <body>{children}</body>
    </html>
  );
}
