import { useStore } from '@tanstack/react-store'
import { AlertCircle, Loader2, WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { clientManager } from '@/lib/client-manager'
import { connectionStore } from '@/stores/connection'

export function ReconnectingModal() {
  const { status, error, hasConnectedOnce } = useStore(
    connectionStore,
    (state) => ({
      status: state.status,
      error: state.error,
      hasConnectedOnce: state.hasConnectedOnce,
    }),
  )

  const showModal = hasConnectedOnce && status !== 'connected'
  const isOffline = typeof navigator !== 'undefined' && !navigator.onLine

  if (!showModal) {
    return null
  }

  const statusCopy = {
    connecting: {
      icon: Loader2,
      title: 'Reconnecting…',
      description: 'We are restoring the connection. Chat actions are temporarily unavailable.',
    },
    disconnected: {
      icon: WifiOff,
      title: 'Connection lost',
      description: 'Trying to reconnect now. Please wait before sending messages or starting a new chat.',
    },
    error: {
      icon: AlertCircle,
      title: 'Connection interrupted',
      description:
        error || 'We hit a connection error and are trying to reconnect automatically.',
    },
  } as const

  const reconnectStatus = status as 'connecting' | 'disconnected' | 'error'
  const config = statusCopy[reconnectStatus]
  const Icon = config.icon

  return (
    <Dialog open>
      <DialogContent
        showCloseButton={false}
        className="max-w-md border-border/60 bg-background/95 p-0 shadow-2xl supports-backdrop-filter:backdrop-blur-xl"
      >
        <div className="relative overflow-hidden rounded-xl">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary/30 via-primary to-primary/30" />

          <div className="space-y-5 p-6">
            <DialogHeader className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary shadow-sm">
                  <Icon
                    className={`h-5 w-5 ${status === 'connecting' ? 'animate-spin' : ''}`}
                  />
                </div>
                <div className="space-y-1">
                  <DialogTitle>{config.title}</DialogTitle>
                  <DialogDescription className="pr-4">
                    {config.description}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="rounded-2xl border border-border/60 bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
              <div className="flex items-center justify-between gap-3">
                <span>Status</span>
                <span className="font-medium capitalize text-foreground">
                  {isOffline ? 'Offline' : status}
                </span>
              </div>
              {error && status === 'error' ? (
                <p className="mt-2 text-xs text-destructive/90">{error}</p>
              ) : null}
            </div>

            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                The app will resume automatically once the socket reconnects.
              </p>
              <Button
                variant="outline"
                onClick={() => clientManager.reconnect()}
                disabled={status === 'connecting' || isOffline}
              >
                Retry now
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
