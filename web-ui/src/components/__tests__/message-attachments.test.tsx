import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MessageAttachments } from '../message-attachments'

describe('MessageAttachments', () => {
  it('renders nothing when attachments are missing', () => {
    const { container } = render(<MessageAttachments attachments={undefined} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders image previews', () => {
    render(
      <MessageAttachments
        attachments={[
          {
            type: 'image',
            name: 'photo.png',
            mimeType: 'image/png',
            previewUrl: 'data:image/png;base64,abc123',
          },
        ]}
      />,
    )

    const img = screen.getByRole('img', { name: 'photo.png' })
    expect(img).toHaveAttribute('src', 'data:image/png;base64,abc123')
  })

  it('renders file pills', () => {
    const { container } = render(
      <MessageAttachments
        attachments={[
          { type: 'file', name: 'notes.pdf', mimeType: 'application/pdf' },
        ]}
      />,
    )

    expect(screen.getByText('notes.pdf')).toBeInTheDocument()
    expect(
      container.querySelector('svg[class*="lucide-file"]'),
    ).toBeInTheDocument()
  })

  it('renders mixed attachment types', () => {
    render(
      <MessageAttachments
        attachments={[
          {
            type: 'image',
            name: 'image.jpg',
            mimeType: 'image/jpeg',
            previewUrl: 'data:image/jpeg;base64,xyz',
          },
          { type: 'file', name: 'report.txt', mimeType: 'text/plain' },
        ]}
      />,
    )

    expect(screen.getByRole('img', { name: 'image.jpg' })).toBeInTheDocument()
    expect(screen.getByText('report.txt')).toBeInTheDocument()
  })
})
