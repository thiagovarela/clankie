import { useStore } from '@tanstack/react-store'
import { Paperclip, Send, Slash } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ClipboardEvent, DragEvent, KeyboardEvent } from 'react'
import type { AttachmentItem } from '@/components/attachment-preview'
import type { ImageContent } from '@/lib/types'
import type { DisplayAttachment } from '@/stores/messages'
import { AttachmentPreview } from '@/components/attachment-preview'
import { CommandPalette } from '@/components/command-palette'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { clientManager } from '@/lib/client-manager'
import { addUserMessage } from '@/stores/messages'
import { sessionStore } from '@/stores/session'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB per file
const MAX_TOTAL_SIZE = 20 * 1024 * 1024 // 20MB total
const COMMAND_TRIGGER_REGEX = /^\/\S*$/

export function ChatInput() {
  const { sessionId, isStreaming } = useStore(sessionStore, (state) => ({
    sessionId: state.sessionId,
    isStreaming: state.isStreaming,
  }))

  const [message, setMessage] = useState('')
  const [attachments, setAttachments] = useState<Array<AttachmentItem>>([])
  const [isDragging, setIsDragging] = useState(false)
  const [isCommandPaletteDismissed, setIsCommandPaletteDismissed] =
    useState(false)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const inputDockRef = useRef<HTMLDivElement>(null)

  const isCommandMode = COMMAND_TRIGGER_REGEX.test(message)
  const commandSearch = isCommandMode ? message.slice(1) : ''
  const showCommandPalette =
    isCommandMode && !isCommandPaletteDismissed && !!sessionId && !isStreaming

  useEffect(() => {
    if (!showCommandPalette) return

    const handlePointerDownOutside = (event: MouseEvent) => {
      if (!inputDockRef.current) return
      if (!inputDockRef.current.contains(event.target as Node)) {
        setIsCommandPaletteDismissed(true)
      }
    }

    document.addEventListener('mousedown', handlePointerDownOutside)
    return () => {
      document.removeEventListener('mousedown', handlePointerDownOutside)
    }
  }, [showCommandPalette])

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

  const handleMessageChange = (value: string) => {
    setMessage(value)
    setIsCommandPaletteDismissed(false)
  }

  const handleCommandSelect = (commandName: string) => {
    setMessage(`/${commandName} `)
    setIsCommandPaletteDismissed(true)
    textareaRef.current?.focus()
  }

  const handleInsertSlash = () => {
    setMessage('/')
    setIsCommandPaletteDismissed(false)
    textareaRef.current?.focus()
  }

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

    // Prepare display metadata and split attachments for transport
    const displayAttachments: Array<DisplayAttachment> = currentAttachments.map(
      (att) => ({
        type: att.mimeType.startsWith('image/') ? 'image' : 'file',
        name: att.file.name,
        mimeType: att.mimeType,
        previewUrl: att.preview,
      }),
    )

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

      // Add user message (with attachment metadata) to UI
      const displayMessageContent = finalMessage
        .replace(/(?:^|\n)\[Attached: [^\]]+\]/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
      addUserMessage(displayMessageContent, displayAttachments)

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
    if (e.key === 'Escape' && showCommandPalette) {
      e.preventDefault()
      setIsCommandPaletteDismissed(true)
      return
    }

    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div
      className="absolute bottom-0 left-0 right-0 z-20 px-4 pb-6 pt-8 bg-gradient-to-t from-background via-background/95 to-transparent"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="mx-auto w-full max-w-3xl">
        {/* Floating dock container */}
        <div
          ref={inputDockRef}
          className="relative rounded-2xl border border-border/40 bg-card/80 backdrop-blur-xl shadow-2xl shadow-black/10 dark:shadow-black/30"
        >
          {showCommandPalette && (
            <CommandPalette
              open={showCommandPalette}
              search={commandSearch}
              onSelect={handleCommandSelect}
            />
          )}

          {/* Attachment previews */}
          {attachments.length > 0 && (
            <div className="px-4 pt-3">
              <AttachmentPreview
                attachments={attachments}
                onRemove={handleRemoveAttachment}
              />
            </div>
          )}

          {/* Textarea with drag-drop indicator */}
          <div className="relative px-4 py-3">
            <Textarea
              ref={textareaRef}
              id="chat-input"
              name="message"
              value={message}
              onChange={(e) => handleMessageChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder="Send a message..."
              className="min-h-[60px] resize-none border-0 bg-transparent p-0 text-base placeholder:text-muted-foreground/70 focus-visible:ring-0 focus-visible:ring-offset-0"
              disabled={!sessionId || isStreaming}
              rows={1}
              style={{ minHeight: '60px', maxHeight: '200px' }}
            />
            {isDragging && (
              <div className="absolute inset-0 flex items-center justify-center rounded-xl border-2 border-dashed border-primary bg-background/90 backdrop-blur-sm m-2">
                <p className="text-sm font-medium text-primary">
                  Drop files here
                </p>
              </div>
            )}
          </div>

          {/* Toolbar row */}
          <div className="flex items-center justify-between gap-2 px-3 pb-3">
            <div className="flex items-center gap-1">
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
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
              >
                <Paperclip className="h-4 w-4" />
                <span className="sr-only">Attach files</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={!sessionId || isStreaming}
                onClick={handleInsertSlash}
                title="Insert command"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
              >
                <Slash className="h-4 w-4" />
                <span className="sr-only">Insert command</span>
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <kbd className="hidden sm:inline-flex h-6 items-center gap-1 rounded border border-border/50 bg-muted/50 px-2 text-[10px] font-medium text-muted-foreground">
                <span>⌘</span>
                <span>↵</span>
              </kbd>
              <Button
                onClick={handleSend}
                disabled={
                  (!message.trim() && attachments.length === 0) ||
                  !sessionId ||
                  isStreaming
                }
                size="icon-sm"
                className="h-8 w-8 transition-transform hover:scale-105 active:scale-95"
              >
                <Send className="h-4 w-4" />
                <span className="sr-only">Send message</span>
              </Button>
            </div>
          </div>
        </div>

        {/* Bottom safe area padding */}
        <div className="h-2" />
      </div>
    </div>
  )
}
