import { BashRenderer } from './bash-renderer'
import { EditRenderer } from './edit-renderer'
import { FindRenderer } from './find-renderer'
import { FallbackRenderer } from './fallback-renderer'
import { GrepRenderer } from './grep-renderer'
import { LsRenderer } from './ls-renderer'
import { ReadRenderer } from './read-renderer'
import { WriteRenderer } from './write-renderer'
import type { ToolRendererRegistry } from './types'

export const builtInRenderers: ToolRendererRegistry = {
  bash: BashRenderer,
  read: ReadRenderer,
  write: WriteRenderer,
  edit: EditRenderer,
  grep: GrepRenderer,
  find: FindRenderer,
  ls: LsRenderer,
}

export { FallbackRenderer }
