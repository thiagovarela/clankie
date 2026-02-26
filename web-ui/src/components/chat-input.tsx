import { useStore } from '@tanstack/react-store'
import { Paperclip, Send } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import type { ClipboardEvent, DragEvent, KeyboardEvent } from 'react'
import type { AttachmentItem } from '@/components/attachment-preview'
import type { ImageContent } from '@/lib/types'
import { AttachmentPreview } from '@/components/attachment-preview'
import { ModelSelector } from '@/components/model-selector'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { clientManager } from '@/lib/client-manager'
import { addUserMessage } from '@/stores/messages'
import { sessionStore } from '@/stores/session'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB per file
const MAX_TOTAL_SIZE = 20 * 1024 * 1024 // 20MB total

export function ChatInput() {
  const { sessionId, isStreaming } = useStore(sessionStore, (state) => ({
    sessionId: state.sessionId,
    isStreaming: state.isStreaming,
  }))

  const [message, setMessage] = useState('')
  const [attachments, setAttachments] = useState<Array<AttachmentItem>>([])
  const [isDragging, setIsDragging] = useState(false)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Convert File to base64
  const fileToBase64 = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        // Remove data:mime/type;base64, prefix
        const base64 = result.split(',')[1]
        resolve(base64)
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }, [])

  // Create preview for image files
  const createImagePreview = useCallback(
    (file: File): Promise<string | undefined> => {
      if (!file.type.startsWith('image/')) {
        return Promise.resolve(undefined)
      }

      return new Promise((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => resolve(undefined)
        reader.readAsDataURL(file)
      })
    },
    [],
  )

  // Add files to attachments
  const addFiles = useCallback(
    async (files: FileList | Array<File>) => {
      const fileArray = Array.from(files)

      // Check total size
      const currentSize = attachments.reduce(
        (sum, att) => sum + att.file.size,
        0,
      )
      const newSize = fileArray.reduce((sum, file) => sum + file.size, 0)

      if (currentSize + newSize > MAX_TOTAL_SIZE) {
        alert(
          `Total attachment size cannot exceed ${MAX_TOTAL_SIZE / 1024 / 1024}MB`,
        )
        return
      }

      // Process each file
      for (const file of fileArray) {
        if (file.size > MAX_FILE_SIZE) {
          alert(
            `File "${file.name}" is too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`,
          )
          continue
        }

        try {
          const base64 = await fileToBase64(file)
          const preview = await createImagePreview(file)

          const newAttachment: AttachmentItem = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            file,
            preview,
            base64,
            mimeType: file.type,
          }

          setAttachments((prev) => [...prev, newAttachment])
        } catch (err) {
          console.error(`Failed to process file "${file.name}":`, err)
          alert(`Failed to process file "${file.name}"`)
        }
      }
    },
    [attachments, fileToBase64, createImagePreview],
  )

  // Handle file input change
  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (files && files.length > 0) {
        addFiles(files)
      }
      // Reset input so same file can be selected again
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    },
    [addFiles],
  )

  // Handle drag and drop
  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(false)

      const files = e.dataTransfer.files
      if (files.length > 0) {
        addFiles(files)
      }
    },
    [addFiles],
  )

  // Handle clipboard paste
  const handlePaste = useCallback(
    (e: ClipboardEvent<HTMLTextAreaElement>) => {
      const items = e.clipboardData.items

      const files: Array<File> = []
      for (const item of Array.from(items)) {
        if (item.kind === 'file') {
          const file = item.getAsFile()
          if (file) {
            files.push(file)
          }
        }
      }

      if (files.length > 0) {
        e.preventDefault()
        addFiles(files)
      }
    },
    [addFiles],
  )

  // Remove attachment
  const handleRemoveAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((att) => att.id !== id))
  }, [])

  // Send message
  const handleSend = async () => {
    if (
      (!message.trim() && attachments.length === 0) ||
      !sessionId ||
      isStreaming
    )
      return

    const content = message.trim()
    const currentAttachments = [...attachments]

    // Clear inputs immediately
    setMessage('')
    setAttachments([])

    // Separate images from non-image files
    const images: Array<ImageContent> = currentAttachments
      .filter((att) => att.mimeType.startsWith('image/'))
      .map((att) => ({
        type: 'image' as const,
        data: att.base64,
        mimeType: att.mimeType,
      }))

    const nonImageFiles = currentAttachments.filter(
      (att) => !att.mimeType.startsWith('image/'),
    )

    // Upload non-image files first and get their paths
    const client = clientManager.getClient()
    if (!client) {
      console.error('No client available')
      return
    }

    let finalMessage = content
    try {
      // Upload non-image files
      for (const file of nonImageFiles) {
        try {
          const result = await client.uploadAttachment(
            sessionId,
            file.file.name,
            file.base64,
            file.mimeType,
          )
          finalMessage += `\n[Attached: ${result.fileName}]`
        } catch (err) {
          console.error(`Failed to upload ${file.file.name}:`, err)
        }
      }

      // Add user message to UI
      addUserMessage(finalMessage || '[Image attachments]')

      // Send prompt with images
      await client.prompt(
        sessionId,
        finalMessage,
        images.length > 0 ? images : undefined,
      )
    } catch (err) {
      console.error('Failed to send message:', err)
    }

    // Focus back on textarea
    textareaRef.current?.focus()
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div
      className="border-t border-border bg-card p-4"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="flex flex-col gap-2">
        {/* Attachment previews */}
        <AttachmentPreview
          attachments={attachments}
          onRemove={handleRemoveAttachment}
        />

        {/* Textarea with drag-drop indicator */}
        <div className="relative">
          <Textarea
            ref={textareaRef}
            id="chat-input"
            name="message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder="Send a message... (Ctrl+Enter to send)"
            className="min-h-[80px] resize-none"
            disabled={!sessionId || isStreaming}
          />
          {isDragging && (
            <div className="absolute inset-0 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-background/80 backdrop-blur-sm">
              <p className="text-sm font-medium text-primary">
                Drop files here
              </p>
            </div>
          )}
        </div>

        {/* Toolbar row */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileInputChange}
              className="hidden"
              accept="image/*,application/pdf,text/*"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={!sessionId || isStreaming}
              onClick={() => fileInputRef.current?.click()}
              title="Attach files"
            >
              <Paperclip className="h-4 w-4" />
              <span className="sr-only">Attach files</span>
            </Button>
            <p className="text-xs text-muted-foreground">
              <kbd className="rounded bg-muted px-1.5 py-0.5">Ctrl+Enter</kbd>{' '}
              to send
            </p>
          </div>

          <div className="flex items-center gap-2">
            <ModelSelector />
            <Button
              onClick={handleSend}
              disabled={
                (!message.trim() && attachments.length === 0) ||
                !sessionId ||
                isStreaming
              }
              size="icon"
            >
              <Send className="h-4 w-4" />
              <span className="sr-only">Send message</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
