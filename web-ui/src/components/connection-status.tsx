import { useStore } from "@tanstack/react-store";
import { Wifi, WifiOff, Loader2, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { connectionStore } from "@/stores/connection";

export function ConnectionStatus() {
  const { status, error } = useStore(connectionStore, (state) => ({
    status: state.status,
    error: state.error,
  }));

  const statusConfig = {
    connected: {
      icon: Wifi,
      label: "Connected",
      variant: "default" as const,
    },
    connecting: {
      icon: Loader2,
      label: "Connecting...",
      variant: "secondary" as const,
    },
    disconnected: {
      icon: WifiOff,
      label: "Disconnected",
      variant: "secondary" as const,
    },
    error: {
      icon: AlertCircle,
      label: error || "Connection error",
      variant: "destructive" as const,
    },
  };

  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <Badge variant={config.variant} className="gap-1.5">
      <Icon className={`h-3.5 w-3.5 ${status === "connecting" ? "animate-spin" : ""}`} />
      <span className="text-xs">{config.label}</span>
    </Badge>
  );
}
