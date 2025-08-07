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
  title: "Noscere Labs",
  description: "Bitcoin SV developer tools and blockchain analysis utilities",
  metadataBase: new URL('https://noscere.dev'), // Update this to your actual domain
  openGraph: {
    title: "Noscere Labs - Bitcoin SV Developer Tools",
    description: "A collection of powerful tools for Bitcoin SV development and blockchain analysis including BEEF parsers, Merkle tree visualizers, and transaction analyzers.",
    url: 'https://noscere.dev',
    siteName: 'Noscere Labs',
    images: [
      {
        url: '/opengraph-image.png',
        width: 1200,
        height: 630,
        alt: 'Noscere Labs - Bitcoin SV Developer Tools',
      }
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: "Noscere Labs - Bitcoin SV Developer Tools",
    description: "A collection of powerful tools for Bitcoin SV development and blockchain analysis including BEEF parsers, Merkle tree visualizers, and transaction analyzers.",
    images: ['/opengraph-image.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
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
