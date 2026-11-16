import type { Metadata } from "next";
import { chatFonts } from "../../../features/chat/fonts";
import { NorthStar } from "./north-star";

export const metadata: Metadata = {
  title: "Perfil longitudinal · Prontuário CBB",
};

export default function ClinicalNorthStarPage() {
  return <NorthStar fonts={chatFonts} />;
}
