import { File } from 'lucide-react'
import type { DisplayAttachment } from '@/stores/messages'
import { cn } from '@/lib/utils'

interface MessageAttachmentsProps {
  attachments?: Array<DisplayAttachment>
}

export function MessageAttachments({ attachments }: MessageAttachmentsProps) {
  if (!attachments || attachments.length === 0) {
    return null
  }

  return (
    <div className="mb-2 flex flex-wrap gap-2">
      {attachments.map((attachment, index) => {
        const key = `${attachment.type}-${attachment.name ?? 'unnamed'}-${index}`

        if (attachment.type === 'image' && attachment.previewUrl) {
          return (
            <a
              key={key}
              href={attachment.previewUrl}
              target="_blank"
              rel="noreferrer"
              className="block"
            >
              <img
                src={attachment.previewUrl}
                alt={attachment.name ?? 'Attached image'}
                className="h-20 w-20 rounded-md border border-primary-foreground/25 object-cover transition-opacity hover:opacity-90"
              />
            </a>
          )
        }

        return (
          <div
            key={key}
            className={cn(
              'inline-flex max-w-full items-center gap-2 rounded-md border px-2 py-1',
              'border-primary-foreground/25 bg-primary-foreground/10 text-primary-foreground',
            )}
          >
            <File className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate text-xs font-medium">
              {attachment.name ?? 'Attached file'}
            </span>
          </div>
        )
      })}
    </div>
  )
}
