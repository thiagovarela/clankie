import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ExtensionRenderHint } from './types'

interface RenderHintRendererProps {
  hint: ExtensionRenderHint
  data: unknown
}

function normalizeText(data: unknown): string {
  if (typeof data === 'string') return data
  return JSON.stringify(data, null, 2)
}

export function RenderHintRenderer({ hint, data }: RenderHintRendererProps) {
  const text = normalizeText(data)

  if (hint.type === 'markdown') {
    return (
      <div className="prose prose-sm dark:prose-invert max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
      </div>
    )
  }

  if (hint.type === 'json') {
    return <pre className="text-xs whitespace-pre-wrap">{text}</pre>
  }

  if (hint.type === 'list') {
    try {
      const items = Array.isArray(data) ? data : JSON.parse(text)
      if (!Array.isArray(items)) throw new Error('not an array')
      return hint.ordered ? (
        <ol className="list-decimal pl-5 text-sm space-y-1">
          {items.map((item, idx) => (
            <li key={idx}>{String(item)}</li>
          ))}
        </ol>
      ) : (
        <ul className="list-disc pl-5 text-sm space-y-1">
          {items.map((item, idx) => (
            <li key={idx}>{String(item)}</li>
          ))}
        </ul>
      )
    } catch {
      return <pre className="text-xs whitespace-pre-wrap">{text}</pre>
    }
  }

  return <pre className="text-xs whitespace-pre-wrap">{text}</pre>
}
