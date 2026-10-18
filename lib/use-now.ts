import { useEffect, useState } from "react";

/** The current time, refreshed every `intervalMs` (default 1 minute). Keeps render pure. */
export function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
