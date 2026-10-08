"use client";
import dynamic from "next/dynamic";

// i18n, theme and localStorage are browser-only, so the app shell renders on the client.
const Shell = dynamic(() => import("../Shell"), { ssr: false });

export default function Providers({ children }: { children: React.ReactNode }) {
  return <Shell>{children}</Shell>;
}
