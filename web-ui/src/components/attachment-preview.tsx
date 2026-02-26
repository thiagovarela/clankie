import { File, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface AttachmentItem {
  id: string
  file: File
  preview?: string // Data URL for image preview
  base64: string
  mimeType: string
}

interface AttachmentPreviewProps {
  attachments: Array<AttachmentItem>
  onRemove: (id: string) => void
}

export function AttachmentPreview({
  attachments,
  onRemove,
}: AttachmentPreviewProps) {
  if (attachments.length === 0) {
    return null
  }

  return (
    <div className="flex flex-wrap gap-2 pb-2">
      {attachments.map((attachment) => {
        const isImage = attachment.mimeType.startsWith('image/')

        return (
          <div
            key={attachment.id}
            className={cn(
              'group relative flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2',
              'hover:bg-muted/80 transition-colors',
            )}
          >
            {isImage && attachment.preview ? (
              <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded">
                <img
                  src={attachment.preview}
                  alt={attachment.file.name}
                  className="h-full w-full object-cover"
                />
              </div>
            ) : (
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-background">
                <File className="h-6 w-6 text-muted-foreground" />
              </div>
            )}

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {attachment.file.name}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatFileSize(attachment.file.size)}
              </p>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={() => onRemove(attachment.id)}
              className="shrink-0"
              title="Remove attachment"
            >
              <X className="h-3 w-3" />
              <span className="sr-only">Remove {attachment.file.name}</span>
            </Button>
          </div>
        )
      })}
    </div>
  )
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${Math.round((bytes / k ** i) * 100) / 100} ${sizes[i]}`
}
