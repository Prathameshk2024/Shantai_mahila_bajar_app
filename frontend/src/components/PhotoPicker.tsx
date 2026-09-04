import { useRef, useState } from 'react'
import { useT } from '../i18n/I18nProvider.js'
import { UploadDisabledError, uploadImage } from '../lib/upload.js'
import { Button, Notice } from './ui.js'

/**
 * Take or choose a product photo, then upload it to Cloudinary.
 *
 * `capture="environment"` opens the rear camera directly on Android instead of
 * a file browser, which is what a seller expects when she taps "फोटो काढा".
 * She can still pick from her gallery.
 *
 * If Cloudinary is not configured the component says so and the wizard falls
 * back to the emoji picker, so the app keeps working with no image account.
 */
export default function PhotoPicker({
  imageUrl,
  onUploaded,
  onCleared,
}: {
  imageUrl?: string
  onUploaded: (img: { url: string; publicId: string }) => void
  onCleared: () => void
}) {
  const t = useT()
  const cameraRef = useRef<HTMLInputElement | null>(null)
  const galleryRef = useRef<HTMLInputElement | null>(null)

  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [disabled, setDisabled] = useState(false)

  async function handle(file: File | undefined) {
    if (!file) return
    setError(null)
    setProgress(0)
    try {
      const img = await uploadImage(file, {
        kind: 'product',
        onProgress: (f) => setProgress(f),
      })
      onUploaded({ url: img.url, publicId: img.publicId })
    } catch (err) {
      if (err instanceof UploadDisabledError) {
        setDisabled(true)
      } else {
        setError(t('photo.failed'))
      }
    } finally {
      setProgress(null)
    }
  }

  if (disabled) {
    return <Notice tone="warn">{t('photo.disabled')}</Notice>
  }

  return (
    <div className="stack-sm">
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => void handle(e.target.files?.[0])}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => void handle(e.target.files?.[0])}
      />

      {imageUrl && (
        <div style={{ position: 'relative' }}>
          <img
            src={imageUrl}
            alt=""
            style={{
              width: '100%', aspectRatio: '1', objectFit: 'cover',
              borderRadius: 'var(--r-lg)', border: '1px solid var(--line)',
            }}
          />
          <Button
            variant="quiet"
            size="sm"
            onClick={onCleared}
            style={{ position: 'absolute', top: 8, right: 8, width: 'auto' }}
          >
            ✕
          </Button>
        </div>
      )}

      {progress !== null && (
        <div>
          <div className="small dim">{t('photo.uploading')} {Math.round(progress * 100)}%</div>
          <div
            style={{
              height: 8, borderRadius: 4, background: 'var(--surface-2)',
              border: '1px solid var(--line)', overflow: 'hidden', marginTop: 4,
            }}
          >
            <div
              style={{
                width: `${Math.round(progress * 100)}%`, height: '100%',
                background: 'var(--maroon)', transition: 'width .2s',
              }}
            />
          </div>
        </div>
      )}

      {error && <Notice tone="danger">{error}</Notice>}

      <div className="btn-row">
        <Button onClick={() => cameraRef.current?.click()} disabled={progress !== null}>
          📷 {t('photo.take')}
        </Button>
        <Button
          variant="ghost"
          onClick={() => galleryRef.current?.click()}
          disabled={progress !== null}
        >
          🖼️ {t('photo.choose')}
        </Button>
      </div>
    </div>
  )
}
