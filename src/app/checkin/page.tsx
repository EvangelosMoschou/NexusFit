import type { Metadata } from "next";
import { CheckInKiosk } from "@/components/CheckInKiosk";

export const metadata: Metadata = {
  title: "Είσοδος & Έξοδος | NEXUS ATHLETICS",
  robots: { index: false, follow: false },
};

export default function CheckInPage() {
  return <CheckInKiosk />;
}
