import { defineCatalog } from '@json-render/core'
import { JSONUIProvider, Renderer, defineRegistry } from '@json-render/react'
import { schema } from '@json-render/react/schema'
import {
  shadcnComponentDefinitions,
  shadcnComponents,
} from '@json-render/shadcn'
import { toast } from 'sonner'
import type { ExtensionUISpec } from './types'
import { clientManager } from '@/lib/client-manager'

const catalog = defineCatalog(schema, {
  components: shadcnComponentDefinitions,
  actions: {
    saveExtensionConfig: {
      description: 'Save extension configuration',
    },
  },
})

const { registry } = defineRegistry(catalog, {
  components: shadcnComponents,
  actions: {
    saveExtensionConfig: async () => {},
  },
})

interface JsonRenderRendererProps {
  spec: ExtensionUISpec
  sessionId?: string
  extensionPath?: string
  initialState?: Record<string, unknown>
  onConfigSaved?: () => Promise<void> | void
}

export function JsonRenderRenderer({
  spec,
  sessionId,
  extensionPath,
  initialState,
  onConfigSaved,
}: JsonRenderRendererProps) {
  const client = clientManager.getClient()

  return (
    <JSONUIProvider
      registry={registry}
      initialState={initialState}
      handlers={{
        saveExtensionConfig: async (params) => {
          if (!client || !sessionId || !extensionPath) {
            toast.error('Not connected')
            return
          }

          const modelValue =
            typeof params.model === 'string' ? params.model.trim() : ''

          try {
            await client.setExtensionConfig(sessionId, extensionPath, {
              enabled: Boolean(params.enabled),
              every: String(params.every ?? ''),
              model:
                modelValue === '' || modelValue === '(default session model)'
                  ? null
                  : modelValue,
            })

            await onConfigSaved?.()
            toast.success('Extension settings saved')
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error)
            toast.error(message)
          }
        },
      }}
    >
      <Renderer spec={spec as any} registry={registry} />
    </JSONUIProvider>
  )
}
