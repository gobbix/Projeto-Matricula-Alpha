import type { Metadata } from "next";
import Painel from "@/components/painel/Painel";
import "./painel.css";

export const metadata: Metadata = { title: "Painel da equipe · Alphaville Clube", robots: { index: false } };

export default function LayoutPainel({ children }: { children: React.ReactNode }) {
  return <Painel>{children}</Painel>;
}
