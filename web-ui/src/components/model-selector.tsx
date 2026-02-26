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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { clientManager } from '@/lib/client-manager'
import { cn } from '@/lib/utils'
import { sessionStore } from '@/stores/session'

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
        setIsOpen(false)
      } catch (err) {
        console.error('[ModelSelector] Failed to set model:', err)
      }
    } else {
      console.error('[ModelSelector] No client available')
    }
  }

  const handleThinkingLevelChange = async (
    level: 'none' | 'normal' | 'extended',
  ) => {
    if (!sessionId) return

    const client = clientManager.getClient()
    if (client) {
      try {
        await client.setThinkingLevel(sessionId, level)
      } catch (err) {
        console.error('Failed to set thinking level:', err)
      }
    }
  }

  const cycleThinkingLevel = () => {
    const levels: Array<'none' | 'normal' | 'extended'> = [
      'none',
      'normal',
      'extended',
    ]
    const currentIndex = levels.indexOf(thinkingLevel)
    const nextLevel = levels[(currentIndex + 1) % levels.length]
    handleThinkingLevelChange(nextLevel)
  }

  const thinkingLevelLabel = {
    none: 'No thinking',
    normal: 'Normal',
    extended: 'Extended thinking',
  }[thinkingLevel]

  if (!model) {
    return null
  }

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger
        type="button"
        disabled={isStreaming || !sessionId}
        className={cn(
          'flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-sm transition-colors',
          'hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
      >
        <span className="font-medium">{model.name}</span>
        {thinkingLevel === 'extended' && (
          <span className="text-muted-foreground">Extended</span>
        )}
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
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

        <DropdownMenuItem
          onClick={cycleThinkingLevel}
          className="flex items-center justify-between"
        >
          <span>Thinking Level</span>
          <span className="text-xs text-muted-foreground">
            {thinkingLevelLabel}
          </span>
        </DropdownMenuItem>
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
