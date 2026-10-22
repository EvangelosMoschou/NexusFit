import { useEffect, useState } from "react";
import { GymConfig } from "@/types";
import { defaultGymConfig } from "@/config/gymConfig";

let sharedFetch: Promise<GymConfig | null> | null = null;

function fetchGymConfig(): Promise<GymConfig | null> {
  sharedFetch ??= fetch("/api/config")
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => (data?.success && data.config ? (data.config as GymConfig) : null))
    .catch(() => null);
  return sharedFetch;
}

// Loads the admin-editable gym config (pricing/schedule/info) once per page
// session. Renders the static default until the server copy arrives.
export function useGymConfig(): { config: GymConfig; loaded: boolean } {
  const [config, setConfig] = useState<GymConfig>(defaultGymConfig);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    fetchGymConfig().then((remote) => {
      if (!active) return;
      if (remote) setConfig(remote);
      setLoaded(true);
    });
    return () => {
      active = false;
    };
  }, []);

  return { config, loaded };
}
