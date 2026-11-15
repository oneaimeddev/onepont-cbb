import type { Metadata } from "next";
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
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="pt-BR" className={barlow.variable}><body>{children}</body></html>;
}
