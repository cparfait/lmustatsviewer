import { useEffect, useState } from "react";
import { CURRENT_VERSION_ID, gameVersions, type GameVersion } from "@/lib/mockData";

const STORAGE_KEY = "lmu-active-version";
const SHOW_OUTDATED_KEY = "lmu-show-outdated";

type Listener = () => void;
let activeVersionId = getInitialVersion();
let showOutdated = getInitialShowOutdated();
const listeners: Set<Listener> = new Set();

function getInitialVersion(): string {
  if (typeof window === "undefined") return CURRENT_VERSION_ID;
  return localStorage.getItem(STORAGE_KEY) ?? CURRENT_VERSION_ID;
}

function getInitialShowOutdated(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(SHOW_OUTDATED_KEY) === "true";
}

function notify() {
  listeners.forEach((l) => l());
}

export function useVersion() {
  const [, force] = useState(0);

  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);

  const setActive = (id: string) => {
    activeVersionId = id;
    localStorage.setItem(STORAGE_KEY, id);
    notify();
  };

  const setShowOutdated = (b: boolean) => {
    showOutdated = b;
    localStorage.setItem(SHOW_OUTDATED_KEY, String(b));
    notify();
  };

  const active: GameVersion = gameVersions.find((v) => v.id === activeVersionId) ?? gameVersions[0];

  return {
    activeId: activeVersionId,
    active,
    versions: gameVersions,
    setActive,
    showOutdated,
    setShowOutdated,
  };
}
