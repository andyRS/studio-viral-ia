import "./globals.css";
import type { ReactNode } from "react";
import type { Viewport } from "next";
import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });
export const metadata = { title: "Estudio Viral", description: "Creative Intelligence Studio para crear, producir y analizar contenido audiovisual." };
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#090d16" };
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="es" className="dark"><body className={`${inter.variable} min-h-screen text-slate-100 antialiased`}>{children}</body></html>;
}
