import type { ExtensionInfo } from '@/lib/types'

export type ExtensionCategory = 'builtIn' | 'packages' | 'local'

const INLINE_PATH_PATTERN = /^<inline:([^>]+)>$/
const NODE_MODULES_SEGMENT_PATTERN = /(^|[\\/])node_modules([\\/]|$)/
const EXTENSIONS_SEGMENT_PATTERN = /(^|[\\/])extensions([\\/]|$)/
const PATH_SPLIT_PATTERN = /[\\/]+/
const FILE_EXTENSION_PATTERN = /\.[a-z0-9]+$/i

const INDEX_FILENAMES = new Set(['index', 'main', 'mod'])
const GENERIC_DIR_SEGMENTS = new Set([
  'src',
  'dist',
  'lib',
  'build',
  'esm',
  'cjs',
])

function splitPath(pathValue: string): Array<string> {
  return pathValue.split(PATH_SPLIT_PATTERN).filter(Boolean)
}

function stripFileExtension(value: string): string {
  return value.replace(FILE_EXTENSION_PATTERN, '')
}

function titleCase(value: string): string {
  return value
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function prettifyName(rawValue: string): string {
  return titleCase(
    rawValue
      .replace(/^@/, '')
      .replace(/[-_.]+/g, ' ')
      .trim(),
  )
}

function extractInlineName(pathValue: string): string | undefined {
  const match = pathValue.match(INLINE_PATH_PATTERN)
  if (!match) {
    return undefined
  }

  return prettifyName(match[1])
}

function extractPackageName(pathValue: string): string | undefined {
  const segments = splitPath(pathValue)
  const nodeModulesIndex = segments.lastIndexOf('node_modules')

  if (nodeModulesIndex >= 0) {
    const first = segments[nodeModulesIndex + 1]
    const second = segments[nodeModulesIndex + 2]

    if (!first) {
      return undefined
    }

    // For scoped packages like @clankie/memory, return just the package name part
    if (first.startsWith('@') && second) {
      return prettifyName(second)
    }

    return prettifyName(first)
  }

  // Fallback for package-manager install roots like ~/.clankie/extensions/@scope/pkg/src/index.ts
  for (let index = 0; index < segments.length - 1; index += 1) {
    const current = segments[index]
    const next = segments[index + 1]
    if (current.startsWith('@') && next) {
      return prettifyName(next)
    }
  }

  return undefined
}

function pickBestPathSegment(pathValue: string): string | undefined {
  const segments = splitPath(pathValue)
  if (segments.length === 0) {
    return undefined
  }

  const lastSegment = stripFileExtension(segments[segments.length - 1])
  if (lastSegment.length === 0) {
    return undefined
  }

  if (INDEX_FILENAMES.has(lastSegment.toLowerCase()) && segments.length > 1) {
    const previous = stripFileExtension(segments[segments.length - 2])
    if (
      GENERIC_DIR_SEGMENTS.has(previous.toLowerCase()) &&
      segments.length > 2
    ) {
      return stripFileExtension(segments[segments.length - 3])
    }
    return previous
  }

  if (GENERIC_DIR_SEGMENTS.has(lastSegment.toLowerCase()) && segments.length > 1) {
    return stripFileExtension(segments[segments.length - 2])
  }

  return lastSegment
}

function isPackageLikePath(pathValue: string): boolean {
  return (
    NODE_MODULES_SEGMENT_PATTERN.test(pathValue) ||
    EXTENSIONS_SEGMENT_PATTERN.test(pathValue)
  )
}

export function deriveExtensionDisplayName(
  path: string,
  resolvedPath?: string,
): string {
  const inlineName = extractInlineName(path)
  if (inlineName) {
    return inlineName
  }

  for (const candidate of [resolvedPath, path]) {
    if (!candidate) {
      continue
    }

    const packageName = extractPackageName(candidate)
    if (packageName) {
      return packageName
    }
  }

  for (const candidate of [resolvedPath, path]) {
    if (!candidate) {
      continue
    }

    const segment = pickBestPathSegment(candidate)
    if (segment) {
      return prettifyName(segment)
    }
  }

  return 'Extension'
}

export function getExtensionCategory(
  extension: Pick<ExtensionInfo, 'path' | 'resolvedPath'>,
): ExtensionCategory {
  if (extension.path.startsWith('<inline:')) {
    return 'builtIn'
  }

  if (
    isPackageLikePath(extension.path) ||
    isPackageLikePath(extension.resolvedPath)
  ) {
    return 'packages'
  }

  return 'local'
}
