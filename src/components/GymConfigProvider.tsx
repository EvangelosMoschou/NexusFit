"use client";

import React from "react";
import { GymConfig } from "@/types";
import { GymConfigContext } from "@/lib/useGymConfig";

export function GymConfigProvider({
  initialConfig,
  children,
}: {
  initialConfig: GymConfig;
  children: React.ReactNode;
}) {
  return <GymConfigContext.Provider value={initialConfig}>{children}</GymConfigContext.Provider>;
}
