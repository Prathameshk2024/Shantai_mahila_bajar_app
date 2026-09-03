import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Category, Unit } from '@shared/types.js'
import { isValidFssai, slotInfo } from '@shared/seller.js'
import { useI18n, useT } from '../../i18n/I18nProvider.js'
import { api, ApiError } from '../../lib/api.js'
import {
  AppBar, AudioHelpButton, Button, Card, Choice, Dots, EmptyState, Field,
  Loading, Notice, Rupees, TextInput, VoiceInput, useAsync,
} from '../../components/ui.js'

const EMOJIS = ['🫙', '🌶️', '🥟', '🍯', '🍪', '🍬', '🥮', '🧺', '🧵', '🥻', '🪡', '📿', '🪔', '🕯️', '🌿', '📦']
const UNITS: Unit[] = ['kg', 'g', 'piece', 'dozen', 'litre', 'ml', 'set']
const STEPS = ['photo', 'basics', 'food', 'details', 'price', 'stock', 'preview'] as const

/**
 * The upload wizard. One question per screen, camera-first.
 *
 * Step 3 is the branch everything depends on: food asks four things (FSSAI
 * number, FSSAI expiry, ingredients, veg/non-veg), non-food asks one
 * (material). Every extra field is a place a first-time seller abandons.
 *
 * The product NAME uses voice input, because a seller who speaks Marathi
 * fluently may still be unable to type it on a phone keyboard.
 */
export default function UploadProduct() {
  const t = useT()
  const { lang } = useI18n()
  const nav = useNavigate()

  const [me, loadingMe] = useAsync(() => api.me(), [])
  const [productData, loadingProducts] = useAsync(() => api.myProducts(), [])
  const [catData] = useAsync(() => api.categories(), [])

  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [serverError, setServerError] = useState('')

  const [d, setD] = useState({
    emoji: '',
    name: '',
    categoryId: '',
    isFood: null as boolean | null,
    fssai: '',
    fssaiExpiry: '',
    ingredients: '',
    vegType: '' as '' | 'veg' | 'nonveg',
    material: '',
    price: '',
    mrp: '',
    unit: 'piece' as Unit,
    stock: '',
    madeToOrder: false,
  })

  type Key = keyof typeof d
  const set = <K extends Key>(k: K, v: (typeof d)[K]) => {
    setD((cur) => ({ ...cur, [k]: v }))
    setErrors((e) => ({ ...e, [k]: '' }))
  }

  if (loadingMe || loadingProducts) {
    return <><AppBar title={t('prod.add')} /><div className="screen"><Loading /></div></>
  }
  if (!me) {
    return <><AppBar title={t('prod.add')} /><div className="screen"><EmptyState title="—" /></div></>
  }

  const seller = me.seller
  const products = productData?.products ?? []
  const slots = slotInfo(seller, products)

  /* Gate 1: not approved yet. */
  if (seller.status !== 'ACTIVE') {
    return (
      <>
        <AppBar title={t('prod.add')} />
        <div className="screen">
          <Card>
            <EmptyState
              icon="⏳"
              title={t('wait.sub')}
              body={t('wait.canDoMeanwhile')}
              action={<Button onClick={() => nav('/seller/subscription')}>{t('pay.title')}</Button>}
            />
          </Card>
        </div>
      </>
    )
  }

  /* Gate 2: slots full. An opportunity, never an error. */
  if (slots.isFull) {
    return (
      <>
        <AppBar title={t('prod.add')} />
        <div className="screen">
          <Card>
            <EmptyState
              icon="🔒"
              title={t('prod.slotsFullTitle')}
              body={t('prod.slotsFullBody')}
              action={
                <div className="stack-sm" style={{ width: '100%' }}>
                  <Button onClick={() => nav('/seller/subscription')}>{t('prof.buyMore')}</Button>
                  <Button variant="ghost" onClick={() => nav('/seller/products')}>
                    {t('biz.myProducts')}
                  </Button>
                </div>
              }
            />
          </Card>
        </div>
      </>
    )
  }

  const categories: Category[] = catData?.categories ?? []
  const visibleCats = categories.filter((c) => (d.isFood === null ? true : c.food === d.isFood))

  function validate(which: (typeof STEPS)[number]): boolean {
    const e: Record<string, string> = {}
    if (which === 'photo' && !d.emoji) e.emoji = t('common.required')
    if (which === 'basics' && !d.name.trim()) e.name = t('common.required')
    if (which === 'food' && d.isFood === null) e.isFood = t('common.required')
    if (which === 'details') {
      if (!d.categoryId) e.categoryId = t('common.required')
      if (d.isFood) {
        if (!isValidFssai(d.fssai)) e.fssai = t('prod.fssaiInvalid')
        if (!d.fssaiExpiry) e.fssaiExpiry = t('common.required')
        if (!d.ingredients.trim()) e.ingredients = t('common.required')
        if (!d.vegType) e.vegType = t('common.required')
      } else if (!d.material.trim()) {
        e.material = t('common.required')
      }
    }
    if (which === 'price' && (!d.price || Number(d.price) <= 0)) e.price = t('common.required')
    if (which === 'stock' && !d.madeToOrder && d.stock === '') e.stock = t('common.required')
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function next() {
    if (!validate(STEPS[step]!)) return
    setStep((s) => Math.min(STEPS.length - 1, s + 1))
  }

  async function publish(asDraft: boolean) {
    setBusy(true)
    setServerError('')
    try {
      await api.createProduct({
        emoji: d.emoji,
        name: d.name.trim(),
        categoryId: d.categoryId,
        isFood: !!d.isFood,
        fssai: d.isFood ? d.fssai : undefined,
        fssaiExpiry: d.isFood ? d.fssaiExpiry : undefined,
        ingredients: d.isFood ? d.ingredients : undefined,
        vegType: d.isFood && d.vegType ? d.vegType : undefined,
        material: d.isFood ? undefined : d.material,
        price: Number(d.price),
        mrp: Number(d.mrp) || 0,
        unit: d.unit,
        stock: d.madeToOrder ? 0 : Number(d.stock),
        madeToOrder: d.madeToOrder,
        asDraft,
      })
      nav('/seller/products', { replace: true })
    } catch (err) {
      if (err instanceof ApiError) {
        setServerError(err.messageMr ?? err.message)
        if (err.fields) setErrors(err.fields)
      } else {
        setServerError('Network error')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <AppBar
        title={t('prod.add')}
        sub={`${t('reg.step')} ${step + 1} ${t('reg.of')} ${STEPS.length}`}
        onBack={() => (step === 0 ? nav('/seller') : setStep((s) => s - 1))}
        right={<AudioHelpButton text={t('prod.add')} />}
      />

      <div style={{ padding: '0 var(--s4)' }}>
        <Dots step={step} total={STEPS.length} />
      </div>

      <div className="screen stack">
        {/* ---------- 1. photo ---------------------------------- */}
        {STEPS[step] === 'photo' && (
          <Field label={t('prod.photos')} hint={t('prod.photosHint')} error={errors.emoji} required>
            <Notice tone="info">
              Skeleton build: pick a picture below. Wire this to the camera with
              the Capacitor Camera plugin when you build the APK.
            </Notice>
            <div className="pgrid" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginTop: 'var(--s3)' }}>
              {EMOJIS.map((e) => (
                <button
                  key={e}
                  className={`card card--tap ${d.emoji === e ? 'choice--on' : ''}`}
                  style={{ fontSize: '2rem', padding: 'var(--s3)', textAlign: 'center' }}
                  onClick={() => set('emoji', e)}
                  aria-pressed={d.emoji === e}
                >
                  {e}
                </button>
              ))}
            </div>
          </Field>
        )}

        {/* ---------- 2. name, with VOICE TYPING ----------------- */}
        {STEPS[step] === 'basics' && (
          <Field label={t('prod.name')} hint={t('prod.nameHint')} error={errors.name} required>
            <VoiceInput
              value={d.name}
              onChange={(v) => set('name', v)}
              error={!!errors.name}
              placeholder={t('prod.namePlaceholder')}
            />
          </Field>
        )}

        {/* ---------- 3. THE BRANCH ------------------------------ */}
        {STEPS[step] === 'food' && (
          <Field label={t('prod.isFood')} error={errors.isFood} required>
            <div className="stack-sm">
              <Choice
                selected={d.isFood === true}
                onSelect={() => { set('isFood', true); set('categoryId', '') }}
                icon="🍪"
                title={t('prod.isFoodYes')}
                sub={t('reg.sellsFoodHint')}
              />
              <Choice
                selected={d.isFood === false}
                onSelect={() => { set('isFood', false); set('categoryId', '') }}
                icon="🧺"
                title={t('prod.isFoodNo')}
              />
            </div>
          </Field>
        )}

        {/* ---------- 4. four fields for food, one for not ------- */}
        {STEPS[step] === 'details' && (
          <>
            <Field label={t('prod.category')} error={errors.categoryId} required>
              <div className="wrap-row">
                {visibleCats.map((c) => (
                  <button
                    key={c.id}
                    className={`chip ${d.categoryId === c.id ? 'chip--on' : ''}`}
                    onClick={() => set('categoryId', c.id)}
                  >
                    {c.icon} {lang === 'mr' ? c.mr : c.en}
                  </button>
                ))}
              </div>
            </Field>

            {d.isFood ? (
              <>
                <Notice tone="warn" title={t('prod.fssai')}>{t('prod.fssaiWhy')}</Notice>

                <Field label={t('prod.fssai')} hint={t('prod.fssaiHint')} error={errors.fssai} required htmlFor="fssai">
                  <TextInput
                    id="fssai"
                    inputMode="numeric"
                    maxLength={14}
                    value={d.fssai}
                    error={!!errors.fssai}
                    onChange={(e) => set('fssai', e.target.value.replace(/\D/g, ''))}
                    placeholder="21522004000123"
                  />
                </Field>

                <Field label={t('prod.fssaiExpiry')} hint={t('prod.fssaiExpiryHint')} error={errors.fssaiExpiry} required htmlFor="fx">
                  <TextInput
                    id="fx"
                    type="date"
                    value={d.fssaiExpiry}
                    error={!!errors.fssaiExpiry}
                    onChange={(e) => set('fssaiExpiry', e.target.value)}
                  />
                </Field>

                <Field label={t('prod.ingredients')} hint={t('prod.ingredientsHint')} error={errors.ingredients} required>
                  <VoiceInput
                    value={d.ingredients}
                    onChange={(v) => set('ingredients', v)}
                    error={!!errors.ingredients}
                    multiline
                    placeholder="गहू, गूळ, तूप, वेलची"
                  />
                </Field>

                <Field label={t('prod.vegType')} error={errors.vegType} required>
                  <div className="yesno">
                    <Choice selected={d.vegType === 'veg'} onSelect={() => set('vegType', 'veg')} icon="🟢" title={t('prod.veg')} />
                    <Choice selected={d.vegType === 'nonveg'} onSelect={() => set('vegType', 'nonveg')} icon="🔴" title={t('prod.nonveg')} />
                  </div>
                </Field>
              </>
            ) : (
              <Field label={t('prod.material')} hint={t('prod.materialHint')} error={errors.material} required>
                <VoiceInput
                  value={d.material}
                  onChange={(v) => set('material', v)}
                  error={!!errors.material}
                  multiline
                  placeholder="कापूस, रेशीम, माती..."
                />
                <div className="wrap-row" style={{ marginTop: 'var(--s2)' }}>
                  {['कापूस', 'रेशीम', 'लोकर', 'माती', 'लाकूड', 'पितळ', 'बांबू', 'ज्यूट'].map((m) => (
                    <button key={m} className="chip" onClick={() => set('material', m)}>{m}</button>
                  ))}
                </div>
              </Field>
            )}
          </>
        )}

        {/* ---------- 5. price ---------------------------------- */}
        {STEPS[step] === 'price' && (
          <>
            <Field label={t('prod.price')} hint={t('prod.priceHint')} error={errors.price} required htmlFor="price">
              <TextInput
                id="price"
                inputMode="numeric"
                value={d.price}
                error={!!errors.price}
                onChange={(e) => set('price', e.target.value.replace(/\D/g, ''))}
                placeholder="220"
              />
            </Field>
            <Field label={`${t('prod.mrp')} (${t('common.optional')})`} htmlFor="mrp">
              <TextInput
                id="mrp"
                inputMode="numeric"
                value={d.mrp}
                onChange={(e) => set('mrp', e.target.value.replace(/\D/g, ''))}
                placeholder="250"
              />
            </Field>
            <Field label={t('prod.unit')} required>
              <div className="wrap-row">
                {UNITS.map((u) => (
                  <button
                    key={u}
                    className={`chip ${d.unit === u ? 'chip--on' : ''}`}
                    onClick={() => set('unit', u)}
                  >
                    {t(`unit.${u}`)}
                  </button>
                ))}
              </div>
            </Field>
          </>
        )}

        {/* ---------- 6. stock ---------------------------------- */}
        {STEPS[step] === 'stock' && (
          <>
            <Field label={t('prod.stock')} error={errors.stock} required htmlFor="stock">
              <TextInput
                id="stock"
                inputMode="numeric"
                value={d.stock}
                error={!!errors.stock}
                disabled={d.madeToOrder}
                onChange={(e) => set('stock', e.target.value.replace(/\D/g, ''))}
                placeholder="10"
              />
            </Field>
            <Choice
              selected={d.madeToOrder}
              onSelect={() => set('madeToOrder', !d.madeToOrder)}
              icon="👩‍🍳"
              title={t('prod.madeToOrder')}
            />
          </>
        )}

        {/* ---------- 7. preview -------------------------------- */}
        {STEPS[step] === 'preview' && (
          <>
            <div className="section-title">{t('prod.preview')}</div>
            <Card>
              <div className="row" style={{ alignItems: 'flex-start' }}>
                <div className="tile__img" style={{ width: 80, height: 80, fontSize: '2.25rem' }}>
                  {d.emoji}
                </div>
                <div className="stack-sm grow" style={{ gap: 4 }}>
                  <strong style={{ fontSize: 'var(--t-md)' }}>{d.name}</strong>
                  <div className="row" style={{ gap: 8 }}>
                    <strong style={{ fontSize: 'var(--t-lg)' }}><Rupees value={Number(d.price)} /></strong>
                    <span className="small dim">/ {t(`unit.${d.unit}`)}</span>
                  </div>
                  {d.isFood && d.vegType && (
                    <span className={`pill pill--${d.vegType === 'veg' ? 'ok' : 'danger'}`}>
                      {d.vegType === 'veg' ? '🟢' : '🔴'}{' '}
                      {d.vegType === 'veg' ? t('prod.veg') : t('prod.nonveg')}
                    </span>
                  )}
                </div>
              </div>

              <hr className="divider" />

              {d.isFood ? (
                <div className="stack-sm small">
                  <div><span className="dim">{t('cus.fssaiNo')}: </span><span className="num">{d.fssai}</span></div>
                  <div><span className="dim">{t('cus.ingredients')}: </span>{d.ingredients}</div>
                </div>
              ) : (
                <div className="small"><span className="dim">{t('cus.material')}: </span>{d.material}</div>
              )}
            </Card>

            <Notice tone="warn">
              {t('prod.willUseSlot', { used: slots.used + 1, total: slots.total })}
            </Notice>

            {serverError && <Notice tone="danger">{serverError}</Notice>}
          </>
        )}
      </div>

      <div className="actionbar">
        {step < STEPS.length - 1 ? (
          <Button onClick={next}>{t('common.next')} →</Button>
        ) : (
          <>
            <Button onClick={() => void publish(false)} disabled={busy}>
              {busy ? t('common.loading') : t('prod.publish')}
            </Button>
            <Button variant="quiet" onClick={() => void publish(true)} disabled={busy}>
              {t('prod.saveDraft')}
            </Button>
          </>
        )}
      </div>
    </>
  )
}
