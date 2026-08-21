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
  title: "IV Compare — Polymères & vieillissement",
  description: "Comparer les performances et les courbes IV après vieillissement DH, TC ou Outdoor.",
  openGraph: {
    title: "IV Compare",
    description: "Polymères • Lamination • Vieillissement",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "IV Compare — Polymères, lamination et vieillissement" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "IV Compare",
    description: "Polymères • Lamination • Vieillissement",
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
    <html lang="fr">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
