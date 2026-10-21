import "./globals.css";
import type { ReactNode } from "react";
import type { Viewport } from "next";
export const metadata = { title: "Estudio Viral", description: "Microdramas con IA para creadores de RD" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#0b0f19" };
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="es" className="dark"><body className="min-h-screen text-slate-100 antialiased">{children}</body></html>;
}
