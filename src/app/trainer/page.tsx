import type { Metadata } from "next";
import { TrainerDashboard } from "@/components/trainer/TrainerDashboard";

export const metadata: Metadata = {
  title: "Χώρος Προσωπικού | NEXUS ATHLETICS",
  robots: { index: false, follow: false },
};

export default function TrainerPage() {
  return <TrainerDashboard />;
}
