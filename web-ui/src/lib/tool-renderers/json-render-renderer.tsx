import { defineCatalog } from '@json-render/core'
import { Renderer, defineRegistry } from '@json-render/react'
import { schema } from '@json-render/react/schema'
import {
  shadcnComponentDefinitions,
  shadcnComponents,
} from '@json-render/shadcn'
import type { ExtensionUISpec } from './types'

const catalog = defineCatalog(schema, {
  components: shadcnComponentDefinitions,
  actions: {},
})

const { registry } = defineRegistry(catalog, {
  components: shadcnComponents,
})

export function JsonRenderRenderer({ spec }: { spec: ExtensionUISpec }) {
  return <Renderer spec={spec as any} registry={registry} />
}
