import Link from "next/link";
import type { Metadata } from "next";
import "./globals.css";
import "./adapt.css";
import "./loading-experience.css";
import { ReadingProvider, ReadAloud } from "@/components/read-aloud";

export const metadata: Metadata = {
  title: "ADAPT | Accessible learning",
  description: "Bring learning material and explore an accessible experience shaped around your needs and preferences.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body><ReadingProvider><a href="#main" className="skip-link">Skip to content</a><header className="site-header"><Link href="/" aria-label="ADAPT home" className="brand">ADAPT<span>Learning, made accessible</span></Link><ReadAloud /></header>{children}</ReadingProvider></body></html>;
}
