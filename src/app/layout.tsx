import type { Metadata, Viewport } from "next";
import "./globals.css";
import localFont from "next/font/local";

const barlow = localFont({
  src: [
    { path: "./fonts/Barlow-Regular.ttf", weight: "400" },
    { path: "./fonts/Barlow-SemiBold.ttf", weight: "600" },
  ],
  variable: "--font-barlow",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Prontuário CBB",
  applicationName: "Prontuário CBB",
  robots: { index: false, follow: false },
  // iPhone "Adicionar à Tela de Início": name under the icon (apple-icon.png).
  appleWebApp: { capable: true, title: "Prontuário CBB", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#f5f6f2",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="pt-BR" className={barlow.variable}><body>{children}</body></html>;
}
