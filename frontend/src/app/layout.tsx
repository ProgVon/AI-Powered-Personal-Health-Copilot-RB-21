import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "../index.css";
import Providers from "./providers";

export const metadata: Metadata = { title: "Health Copilot" };
export const viewport: Viewport = { themeColor: [{ media: "(prefers-color-scheme: light)", color: "#f4f8f5" }, { media: "(prefers-color-scheme: dark)", color: "#0d1712" }] };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Anek+Latin:wdth,wght@75..125,400..700&family=Anek+Devanagari:wdth,wght@75..125,400..700&family=Anek+Telugu:wdth,wght@75..125,400..700&family=Noto+Sans:wght@400;500;600;700&family=Noto+Sans+Devanagari:wght@400;500;600;700&family=Noto+Sans+Telugu:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <script dangerouslySetInnerHTML={{ __html: 'try { if (localStorage.getItem("theme-v2") === "dark") document.documentElement.classList.add("dark"); } catch (e) {}' }} />
      </head>
      <body><Providers>{children}</Providers></body>
    </html>
  );
}
