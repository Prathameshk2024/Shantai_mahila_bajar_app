import { useCallback, useEffect, useRef, useState } from 'react'
import { useI18n, useT } from '../i18n/I18nProvider.js'
import { useVoiceInput } from '../lib/useVoiceInput.js'

/**
 * ONE voice button, in the header, for the whole signed-in app.
 *
 * It dictates into whichever field the seller last touched, so there is no
 * microphone repeated beside every input. Two details make that work:
 *
 *  1. We remember the last focused input on `focusin` rather than reading
 *     document.activeElement when the mic is pressed - by then focus has
 *     already moved to the button itself.
 *  2. React does not see a direct `input.value = x` assignment. We call the
 *     native value setter and dispatch a real `input` event so the component's
 *     onChange fires and state updates like any other keystroke.
 *
 * Recognition language follows the app language, so switching to English
 * switches the dictation too.
 */
export default function VoiceButton() {
  const t = useT()
  const { lang } = useI18n()

  const lastFieldRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)
  const [noField, setNoField] = useState(false)

  // Track the last editable field she touched, app-wide.
  useEffect(() => {
    function onFocusIn(e: FocusEvent) {
      const el = e.target as HTMLElement | null
      if (!el) return
      const editable =
        (el instanceof HTMLInputElement &&
          !['button', 'submit', 'checkbox', 'radio', 'file'].includes(el.type)) ||
        el instanceof HTMLTextAreaElement
      if (editable) {
        lastFieldRef.current = el as HTMLInputElement | HTMLTextAreaElement
        setNoField(false)
      }
    }
    document.addEventListener('focusin', onFocusIn)
    return () => document.removeEventListener('focusin', onFocusIn)
  }, [])

  /** Write into the field the way React expects, so onChange fires. */
  const insert = useCallback((text: string) => {
    const el = lastFieldRef.current
    if (!el || !document.contains(el)) {
      setNoField(true)
      return
    }

    const proto =
      el instanceof HTMLTextAreaElement
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
    if (!setter) return

    const current = el.value
    const next = current ? `${current} ${text}` : text

    setter.call(el, next)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.focus()
  }, [])

  const { supported, listening, toggle, interim } = useVoiceInput(insert, {
    lang: lang === 'en' ? 'en-IN' : 'mr-IN',
  })

  // Nothing to show on a phone with no speech engine (iOS Safari). The
  // keyboard was never taken away, so there is no lost capability.
  if (!supported) return null

  return (
    <>
      <button
        className={`appbar__btn ${listening ? 'appbar__btn--rec' : ''}`}
        onClick={toggle}
        aria-pressed={listening}
        aria-label={listening ? t('common.listening') : t('voice.tapToSpeak')}
        title={t('voice.tapToSpeak')}
      >
        {listening ? '⏹' : '🎤'}
      </button>

      {/* A single live banner under the header while she is speaking. */}
      {listening && (
        <div className="voicebar" role="status">
          <span className="voicebar__dot" aria-hidden="true" />
          <span className="grow">
            {interim || (noField ? t('voice.tapFieldFirst') : t('common.listening'))}
          </span>
        </div>
      )}
    </>
  )
}
