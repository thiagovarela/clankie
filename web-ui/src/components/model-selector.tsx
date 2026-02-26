import { useStore } from '@tanstack/react-store'
import { Check, ChevronDown } from 'lucide-react'
import { useState } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { clientManager } from '@/lib/client-manager'
import { cn } from '@/lib/utils'
import {
  sessionStore,
  setModel,
  setThinkingLevel as setThinkingLevelStore,
} from '@/stores/session'

export function ModelSelector() {
  const { sessionId, model, availableModels, thinkingLevel, isStreaming } =
    useStore(sessionStore, (state) => ({
      sessionId: state.sessionId,
      model: state.model,
      availableModels: state.availableModels,
      thinkingLevel: state.thinkingLevel,
      isStreaming: state.isStreaming,
    }))

  const [isOpen, setIsOpen] = useState(false)

  const handleModelSelect = async (provider: string, modelId: string) => {
    if (!sessionId) {
      console.log('[ModelSelector] No sessionId')
      return
    }

    console.log('[ModelSelector] Changing model:', {
      provider,
      modelId,
      sessionId,
    })

    const client = clientManager.getClient()
    if (client) {
      try {
        const result = await client.setModel(sessionId, provider, modelId)
        console.log('[ModelSelector] Model changed successfully:', result)
        // Immediately update the store with the returned model info
        setModel(result)
        setIsOpen(false)
      } catch (err) {
        console.error('[ModelSelector] Failed to set model:', err)
      }
    } else {
      console.error('[ModelSelector] No client available')
    }
  }

  const handleThinkingLevelChange = async (
    level: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh',
  ) => {
    if (!sessionId) return

    const client = clientManager.getClient()
    if (client) {
      try {
        await client.setThinkingLevel(sessionId, level)
        // Immediately update the store
        setThinkingLevelStore(level)
      } catch (err) {
        console.error('Failed to set thinking level:', err)
      }
    }
  }

  const thinkingLevelOptions = [
    { value: 'off' as const, label: 'Off' },
    { value: 'minimal' as const, label: 'Minimal' },
    { value: 'low' as const, label: 'Low' },
    { value: 'medium' as const, label: 'Medium' },
    { value: 'high' as const, label: 'High' },
    { value: 'xhigh' as const, label: 'XHigh' },
  ]

  if (!model) {
    return null
  }

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger
        type="button"
        disabled={isStreaming || !sessionId}
        className={cn(
          'flex flex-col items-start gap-0.5 rounded-lg border border-border bg-background px-3 py-1.5 text-sm transition-colors',
          'hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
      >
        <div className="flex items-center gap-1.5 w-full">
          <span className="font-medium">{model.name}</span>
          <ChevronDown className="h-4 w-4 text-muted-foreground ml-auto" />
        </div>
        {thinkingLevel !== 'medium' && (
          <span className="text-xs text-muted-foreground">
            thinking: {thinkingLevel}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Select Model</DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />

        <div className="max-h-96 overflow-y-auto">
          {availableModels.map((m) => {
            const isActive = model.provider === m.provider && model.id === m.id
            return (
              <DropdownMenuItem
                key={`${m.provider}/${m.id}`}
                onClick={() => handleModelSelect(m.provider, m.id)}
                className="flex items-start gap-2 py-2"
              >
                <div className="flex h-5 w-5 items-center justify-center shrink-0">
                  {isActive && <Check className="h-4 w-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{m.name}</div>
                  <div className="text-xs text-muted-foreground line-clamp-2">
                    {getModelDescription(m)}
                  </div>
                </div>
              </DropdownMenuItem>
            )
          })}
        </div>

        <DropdownMenuSeparator />

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <span>Thinking Level</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {thinkingLevelOptions.map((option) => (
              <DropdownMenuItem
                key={option.value}
                onClick={() => handleThinkingLevelChange(option.value)}
                className="flex items-center gap-2"
              >
                <div className="flex h-5 w-5 items-center justify-center shrink-0">
                  {thinkingLevel === option.value && (
                    <Check className="h-4 w-4" />
                  )}
                </div>
                <span>{option.label}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function getModelDescription(model: {
  provider: string
  id: string
  name: string
}): string {
  // Provide fallback descriptions based on model name patterns
  const name = model.name.toLowerCase()

  if (name.includes('opus')) {
    return 'Most capable for ambitious work'
  }
  if (name.includes('sonnet')) {
    return 'Most efficient for everyday tasks'
  }
  if (name.includes('haiku')) {
    return 'Fastest for quick answers'
  }
  if (name.includes('gpt-4')) {
    return 'Advanced reasoning and analysis'
  }
  if (name.includes('gpt-3.5')) {
    return 'Fast and efficient'
  }
  if (name.includes('gemini')) {
    return "Google's multimodal AI"
  }
  if (name.includes('claude')) {
    return "Anthropic's AI assistant"
  }

  return `${model.provider}/${model.id}`
}
