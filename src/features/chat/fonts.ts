import { GeistSerifRegular } from "geist/font/serif/regular";
import { Geist } from "next/font/google";

const geist = Geist({
  subsets: ["latin"],
  weight: "variable",
  variable: "--font-geist",
  display: "swap",
});

export const chatFonts = `${geist.variable} ${GeistSerifRegular.variable}`;
