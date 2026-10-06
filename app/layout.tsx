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
  metadataBase: new URL(process.env.SITE_ORIGIN ?? "http://localhost:3000"),
  title: "IV Compare — Polymers & ageing",
  description: "Explore photovoltaic encapsulant performance under damp heat, thermal cycling, outdoor exposure and light ageing. Compare cells, inspect J–V curves and export reproducible figures.",
  openGraph: {
    title: "IV Compare",
    description: "Photovoltaic encapsulants · ageing data and reproducible comparisons",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "IV Compare — Polymers, lamination, and ageing" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "IV Compare",
    description: "Photovoltaic encapsulants · ageing data and reproducible comparisons",
    images: ["/og.png"],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
