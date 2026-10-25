import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Public_Sans } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const display = Barlow_Condensed({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-display" });
const corpo = Public_Sans({ subsets: ["latin"], variable: "--font-body" });

export const metadata: Metadata = {
  title: "Inscrição em atividades · Alphaville Clube",
  description: "Inscrição online nas atividades esportivas do Alphaville Clube.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${display.variable} ${corpo.variable}`}>
      <body>
        <header className="topo">
          <div className="in">
            <Link href="/" className="marca">Alphaville Clube</Link>
            <span className="eyebrow">Atividades esportivas</span>
          </div>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
