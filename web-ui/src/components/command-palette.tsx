import { useStore } from '@tanstack/react-store'
import { Braces, FileCode2, Wrench } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ComponentType } from 'react'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { clientManager } from '@/lib/client-manager'
import { cn } from '@/lib/utils'
import { sessionStore } from '@/stores/session'

type CommandSource = 'extension' | 'prompt' | 'skill'

interface AvailableCommand {
  name: string
  description?: string
  source: string
  location?: string
  path?: string
}

interface CommandPaletteProps {
  open: boolean
  search: string
  onSelect: (commandName: string) => void
  className?: string
}

const SOURCE_ORDER: Array<CommandSource> = ['extension', 'prompt', 'skill']

const SOURCE_LABELS: Record<CommandSource, string> = {
  extension: 'Extensions',
  prompt: 'Prompt Templates',
  skill: 'Skills',
}

const SOURCE_ICONS: Record<
  CommandSource,
  ComponentType<{ className?: string }>
> = {
  extension: Wrench,
  prompt: FileCode2,
  skill: Braces,
}

export function CommandPalette({
  open,
  search,
  onSelect,
  className,
}: CommandPaletteProps) {
  const { sessionId } = useStore(sessionStore, (state) => ({
    sessionId: state.sessionId,
  }))

  const [commands, setCommands] = useState<Array<AvailableCommand>>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cacheRef = useRef<Map<string, Array<AvailableCommand>>>(new Map())

  useEffect(() => {
    if (!open || !sessionId) return

    const cached = cacheRef.current.get(sessionId)
    if (cached) {
      setCommands(cached)
      return
    }

    const client = clientManager.getClient()
    if (!client) {
      setError('No client available')
      return
    }

    let isCancelled = false

    setIsLoading(true)
    setError(null)

    client
      .getCommands(sessionId)
      .then((result) => {
        if (isCancelled) return

        const sorted = [...result.commands].sort((a, b) =>
          a.name.localeCompare(b.name),
        )

        cacheRef.current.set(sessionId, sorted)
        setCommands(sorted)
      })
      .catch((err) => {
        if (isCancelled) return
        console.error('[CommandPalette] Failed to load commands:', err)
        setError('Failed to load commands')
      })
      .finally(() => {
        if (isCancelled) return
        setIsLoading(false)
      })

    return () => {
      isCancelled = true
    }
  }, [open, sessionId])

  const filteredCommands = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return commands

    return commands.filter((command) => {
      const nameMatch = command.name.toLowerCase().includes(query)
      const descriptionMatch =
        command.description?.toLowerCase().includes(query) ?? false
      return nameMatch || descriptionMatch
    })
  }, [commands, search])

  const commandsBySource = useMemo(() => {
    const groups = new Map<CommandSource, Array<AvailableCommand>>()

    for (const source of SOURCE_ORDER) {
      groups.set(source, [])
    }

    for (const command of filteredCommands) {
      if (command.source === 'extension') {
        groups.get('extension')!.push(command)
      } else if (command.source === 'prompt') {
        groups.get('prompt')!.push(command)
      } else if (command.source === 'skill') {
        groups.get('skill')!.push(command)
      }
    }

    return groups
  }, [filteredCommands])

  if (!open) {
    return null
  }

  return (
    <div
      className={cn(
        'absolute bottom-full left-0 right-0 mb-2 z-40 rounded-xl border border-border/60 bg-popover/95 backdrop-blur-xl shadow-2xl shadow-black/10 dark:shadow-black/30',
        className,
      )}
      data-testid="command-palette"
    >
      <Command shouldFilter={false}>
        <CommandList>
          {isLoading ? (
            <CommandEmpty>Loading commands...</CommandEmpty>
          ) : error ? (
            <CommandEmpty>{error}</CommandEmpty>
          ) : (
            <>
              <CommandEmpty>No commands found.</CommandEmpty>

              {SOURCE_ORDER.filter(
                (source) => (commandsBySource.get(source) ?? []).length > 0,
              ).map((source, index) => {
                const sourceCommands = commandsBySource.get(source) ?? []
                const Icon = SOURCE_ICONS[source]

                return (
                  <div key={source}>
                    {index > 0 && <CommandSeparator />}
                    <CommandGroup heading={SOURCE_LABELS[source]}>
                      {sourceCommands.map((command) => (
                        <CommandItem
                          key={`${source}-${command.name}`}
                          value={command.name}
                          onSelect={() => onSelect(command.name)}
                          className="items-start"
                        >
                          <Icon className="mt-0.5 h-4 w-4 text-muted-foreground" />
                          <div className="flex min-w-0 flex-col">
                            <span className="font-medium">/{command.name}</span>
                            {command.description && (
                              <span className="text-xs text-muted-foreground line-clamp-2">
                                {command.description}
                              </span>
                            )}
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </div>
                )
              })}
            </>
          )}
        </CommandList>
      </Command>
    </div>
  )
}
