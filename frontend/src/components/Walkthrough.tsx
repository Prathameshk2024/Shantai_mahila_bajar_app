import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useT } from '../i18n/I18nProvider.js'
import {
  TOURS, TOUR_MENU, markTourSeen, seenTours, type TourId,
} from '../lib/tours.js'
import { Button, Dots } from './ui.js'
import { IconNext, IconTraining } from './icons.js'

/**
 * The walkthrough for ONE page. Drop `<PageTour id="..." />` at the end of a
 * screen and it opens itself the first time she lands there.
 *
 * It rings the real control - there is no mock screen anywhere in here - so
 * what she is taught is the thing she then taps.
 */
export function PageTour({ id }: { id: TourId }) {
  const t = useT()
  const nav = useNavigate()
  const loc = useLocation()
  const steps = TOURS[id]

  const [step, setStep] = useState<number | null>(null)
  const [rect, setRect] = useState<DOMRect | null>(null)

  /* Help & Training asks for a replay by navigating here with the tour id in
     route state. The state is dropped as soon as it is spent, so a Back press
     onto this same entry does not start it over. */
  const replay = (loc.state as { tour?: TourId } | null)?.tour === id

  useEffect(() => {
    if (replay) {
      setStep(0)
      nav(loc.pathname, { replace: true, state: null })
    } else if (!seenTours(localStorage).includes(id)) {
      setStep(0)
    }
  }, [id, replay, loc.pathname, nav])

  /* Follow the control: the screen scrolls under the ring, and a phone
     keyboard or a rotation moves everything. */
  useEffect(() => {
    if (step === null) return
    const sel = steps[step]?.sel
    const el = sel ? document.querySelector(sel) : null
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })

    const measure = () => setRect(el ? el.getBoundingClientRect() : null)
    measure()
    // The scroll above is animated, so one measurement lands mid-flight.
    const settle = setTimeout(measure, 400)
    window.addEventListener('scroll', measure, true)
    window.addEventListener('resize', measure)
    return () => {
      clearTimeout(settle)
      window.removeEventListener('scroll', measure, true)
      window.removeEventListener('resize', measure)
    }
  }, [step, steps])

  const close = useCallback(() => {
    // Skipping counts as done. Being shown the same overlay every visit
    // because she chose not to read it is nagging, not teaching.
    markTourSeen(localStorage, id)
    setStep(null)
    setRect(null)
  }, [id])

  useEffect(() => {
    if (step === null) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step, close])

  if (step === null || !steps.length) return null

  const s = steps[Math.min(step, steps.length - 1)]!
  const last = step >= steps.length - 1
  // The card sits opposite the control, so it never covers what it explains.
  const cardTop = !!rect && rect.top + rect.height / 2 > window.innerHeight * 0.55

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-label={t('wt.title')}>
      {/* Catches every tap: during a walkthrough the page underneath is a
          picture, not a control. */}
      <div className="tour__block" onClick={close} />
      {rect ? (
        <div
          className="tour__ring"
          style={{
            top: rect.top - 6, left: rect.left - 6,
            width: rect.width + 12, height: rect.height + 12,
          }}
        />
      ) : (
        <div className="tour__dim" />
      )}

      <div className={`tour__card ${cardTop ? 'tour__card--top' : ''}`}>
        <Dots step={step} total={steps.length} />
        <h2 className="h2">{t(s.title)}</h2>
        <p className="body">{t(s.body)}</p>
        <div className="btn-row">
          <Button variant="quiet" onClick={close}>{t('common.skip')}</Button>
          <Button onClick={() => (last ? close() : setStep(step + 1))}>
            {last ? t('common.done') : t('common.next')}
          </Button>
        </div>
      </div>
    </div>
  )
}

/**
 * The Help & Training list: one row per bottom tab. Tapping one goes to the
 * REAL page and starts its walkthrough there, seen before or not.
 */
export function TourMenu({ role }: { role: 'seller' | 'customer' }) {
  const t = useT()
  const nav = useNavigate()
  return (
    <div className="stack-sm" data-wt="help-tours">
      {TOUR_MENU[role].map(({ id, to, label }) => (
        <button key={id} className="tile" onClick={() => nav(to, { state: { tour: id } })}>
          <div className="tile__img" aria-hidden="true"><IconTraining /></div>
          <div className="tile__body">
            <div className="tile__title">{t(label)}</div>
            <div className="tile__meta">{t('wt.replay')}</div>
          </div>
          <span aria-hidden="true"><IconNext /></span>
        </button>
      ))}
    </div>
  )
}
