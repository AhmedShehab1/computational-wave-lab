import { useCallback, useRef, useState } from 'react'
import { validateImageFile } from '@/utils/imageValidation'
import { useGlobalStore } from '@/state/globalStore'
import type { FileSlot } from '@/types'

interface UploadPanelProps {
  onFilesAccepted: (files: File[]) => void
}

const ACCEPT = 'image/png,image/jpeg,image/jpg,image/bmp,image/tiff'
const slots: FileSlot[] = ['A', 'B', 'C', 'D']

export function UploadPanel({ onFilesAccepted }: UploadPanelProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const pushToast = useGlobalStore((s) => s.pushToast)
  const [isDragging, setDragging] = useState(false)

  const handleFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList) return
      const files = Array.from(fileList)
      const accepted: File[] = []

      for (const file of files) {
        const result = validateImageFile(file)
        if (!result.ok) {
          pushToast({ id: crypto.randomUUID(), type: 'error', message: result.error || 'Upload failed' })
          continue
        }
        accepted.push(file)
      }

      if (accepted.length === 0) return

      onFilesAccepted(accepted.slice(0, slots.length))
    },
    [onFilesAccepted, pushToast],
  )

  const onDrop = useCallback(
    (ev: React.DragEvent<HTMLDivElement>) => {
      ev.preventDefault()
      setDragging(false)
      handleFiles(ev.dataTransfer.files)
    },
    [handleFiles],
  )

  const onBrowseClick = useCallback(() => {
    inputRef.current?.click()
  }, [])

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      style={{
        border: `1px dashed ${isDragging ? 'var(--accent-teal)' : 'var(--panel-border)'}`,
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-4)',
        background: 'rgba(255,255,255,0.02)',
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        style={{ display: 'none' }}
        onChange={(e) => handleFiles(e.target.files)}
      />
      <p style={{ margin: 0, color: 'var(--text-muted)' }}>
        Drop images here or <button onClick={onBrowseClick}>browse</button>
      </p>
      <small style={{ color: 'var(--text-muted)' }}>Accepted: PNG, JPG, JPEG, BMP, TIFF — up to 10MB</small>
    </div>
  )
}
