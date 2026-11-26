import { createContext, useContext, useEffect, useState } from "react";
import { GymConfig } from "@/types";
import { defaultGymConfig } from "@/config/gymConfig";

export const GymConfigContext = createContext<GymConfig | null>(null);

let sharedFetch: Promise<GymConfig | null> | null = null;

function fetchGymConfig(): Promise<GymConfig | null> {
  if (!sharedFetch) {
    sharedFetch = fetch("/api/config")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.success && data.config) return data.config as GymConfig;
        sharedFetch = null;
        return null;
      })
      .catch(() => {
        sharedFetch = null;
        return null;
      });
  }
  return sharedFetch;
}

// Reads the SSR-injected gym config when present, or fetches /api/config once
// per page session in standalone/demo contexts.
export function useGymConfig(): { config: GymConfig; loaded: boolean } {
  const initialConfig = useContext(GymConfigContext);
  const [config, setConfig] = useState<GymConfig>(initialConfig ?? defaultGymConfig);
  const [loaded, setLoaded] = useState(initialConfig !== null);

  useEffect(() => {
    if (initialConfig !== null) return;
    let active = true;
    fetchGymConfig().then((remote) => {
      if (!active) return;
      if (remote) setConfig(remote);
      setLoaded(true);
    });
    return () => {
      active = false;
    };
  }, [initialConfig]);

  return { config, loaded };
}
