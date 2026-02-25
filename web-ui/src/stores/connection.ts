/**
 * Connection store — manages WebSocket connection settings and state.
 * Persists settings to localStorage.
 */

import { Store } from "@tanstack/store";
import type { ConnectionState } from "@/lib/ws-client";

export interface ConnectionSettings {
  url: string;
  authToken: string;
}

export interface ConnectionStore {
  settings: ConnectionSettings;
  status: ConnectionState;
  error?: string;
}

const DEFAULT_SETTINGS: ConnectionSettings = {
  url: "ws://localhost:3100",
  authToken: "",
};

// Load settings from localStorage
function loadSettings(): ConnectionSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  
  try {
    const saved = localStorage.getItem("clankie-connection");
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (err) {
    console.error("Failed to load connection settings:", err);
  }
  
  return DEFAULT_SETTINGS;
}

// Save settings to localStorage
function saveSettings(settings: ConnectionSettings): void {
  if (typeof window === "undefined") return;
  
  try {
    localStorage.setItem("clankie-connection", JSON.stringify(settings));
  } catch (err) {
    console.error("Failed to save connection settings:", err);
  }
}

export const connectionStore = new Store<ConnectionStore>({
  settings: loadSettings(),
  status: "disconnected",
  error: undefined,
});

// ─── Actions ───────────────────────────────────────────────────────────────────

export function updateConnectionSettings(settings: Partial<ConnectionSettings>): void {
  connectionStore.setState((state) => {
    const updated = { ...state.settings, ...settings };
    saveSettings(updated);
    return {
      ...state,
      settings: updated,
    };
  });
}

export function updateConnectionStatus(status: ConnectionState, error?: string): void {
  connectionStore.setState((state) => ({
    ...state,
    status,
    error,
  }));
}

export function resetConnectionError(): void {
  connectionStore.setState((state) => ({
    ...state,
    error: undefined,
  }));
}
