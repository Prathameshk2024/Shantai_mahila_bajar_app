import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { BusinessType, DigitalProfile, DispatchTime, Seller } from '@shared/types.js'
import { EDUCATION_LEVELS, isValidFssai, isValidPincode, isValidUpi } from '@shared/seller.js'
import { VILLAGES, makeWomenBizId, villageCode } from '@shared/womenbiz.js'
import {
  BAND_LABEL, computeReadiness, readinessBand, SELF_REPORTED_FACTORS,
} from '@shared/readiness.js'
import { useI18n, useT } from '../../i18n/I18nProvider.js'
import { useAuth } from '../../store/AuthContext.js'
import { api, ApiError } from '../../lib/api.js'
import {
  AppBar, AudioHelpButton, Button, Card, Choice, Dots, Field, Notice,
  Rupees, TextInput, VoiceInput, YesNo,
} from '../../components/ui.js'

/**
 * SELLER REGISTRATION WIZARD
 * ==========================
 * Six steps, one topic per screen, with progress dots so she can see the end
 * coming. Everything she is asked here comes from the Shanta Mahila Bazar survey design:
 * personal details, village (which becomes her ID), business, digital usage,
 * and where her money arrives.
 *
 * Nothing optional blocks a step. The only hard gates are the fields that are
 * either legally required (FSSAI for food) or unrecoverable if wrong (UPI,
 * pincode).
 */

interface Draft {
  name: string
  age: string
  education: string
  whatsapp: string
  villagePreset: string
  villageOther: string
  taluka: string
  district: string
  pincode: string
  shopName: string
  businessType: BusinessType
  shgName: string
  yearsInBusiness: string
  monthlyCapacity: string
  about: string
  sellsFood: boolean | null
  fssai: string
  fssaiExpiry: string
  upiId: string
  deliveryFee: string
  minOrder: string
  dispatch: DispatchTime
  digital: Partial<DigitalProfile>
}

const EMPTY: Draft = {
  name: '', age: '', education: '', whatsapp: '',
  villagePreset: '', villageOther: '', taluka: '', district: '', pincode: '',
  shopName: '', businessType: 'individual', shgName: '',
  yearsInBusiness: '', monthlyCapacity: '', about: '',
  sellsFood: null, fssai: '', fssaiExpiry: '',
  upiId: '', deliveryFee: '0', minOrder: '0', dispatch: 'same',
  digital: {},
}

const STEP_KEYS = ['reg.s1', 'reg.s2', 'reg.s3', 'reg.s4', 'reg.s5', 'reg.s6']

export default function SellerRegister() {
  const t = useT()
  const { lang } = useI18n()
  const nav = useNavigate()
  const { signIn } = useAuth()
  const [params] = useSearchParams()
  const phone = params.get('phone') ?? ''

  const [step, setStep] = useState(0)
  const [d, setD] = useState<Draft>(EMPTY)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [serverError, setServerError] = useState('')
  const [created, setCreated] = useState<Seller | null>(null)

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setD((cur) => ({ ...cur, [k]: v }))
    setErrors((e) => ({ ...e, [k]: '' }))
  }

  const village = d.villagePreset === '__other__' ? d.villageOther : d.villagePreset

  // Preview her ID live, so the thing that goes on her packaging is not a
  // surprise at the end.
  const previewId = useMemo(
    () => (village ? makeWomenBizId(village, []) : ''),
    [village],
  )

  // Baseline score: self-reported answers only. The four measured factors stay
  // at zero until she actually does them on the platform.
  const answered = SELF_REPORTED_FACTORS.filter((f) => d.digital[f.key] !== undefined).length
  const score = computeReadiness({
    smartphone: !!d.digital.smartphone,
    internet: !!d.digital.internet,
    upi: !!d.digital.upi,
    whatsappBusiness: !!d.digital.whatsappBusiness,
    socialMedia: !!d.digital.socialMedia,
    digitalMarketing: !!d.digital.digitalMarketing,
  })

  function validate(which: number): boolean {
    const e: Record<string, string> = {}
    if (which === 0) {
      if (!d.name.trim()) e.name = t('common.required')
      if (d.age && (Number(d.age) < 18 || Number(d.age) > 90)) e.age = '18 - 90'
    }
    if (which === 1) {
      if (!village.trim()) e.villagePreset = t('common.required')
      if (!isValidPincode(d.pincode)) e.pincode = t('reg.pincodeHint')
    }
    if (which === 2) {
      if (!d.shopName.trim()) e.shopName = t('common.required')
      if (d.sellsFood === null) e.sellsFood = t('common.required')
      if (d.sellsFood) {
        if (!isValidFssai(d.fssai)) e.fssai = t('reg.fssaiInvalid')
        if (!d.fssaiExpiry) e.fssaiExpiry = t('common.required')
      }
    }
    if (which === 3 && answered < SELF_REPORTED_FACTORS.length) {
      e.digital = t('common.required')
    }
    if (which === 4 && !isValidUpi(d.upiId)) e.upiId = t('reg.upiPlaceholder')
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function next() {
    if (!validate(step)) return
    setStep((s) => Math.min(STEP_KEYS.length - 1, s + 1))
  }

  async function submit() {
    setBusy(true)
    setServerError('')
    try {
      const res = await api.registerSeller({
        phone,
        name: d.name.trim(),
        age: d.age ? Number(d.age) : undefined,
        education: d.education || undefined,
        whatsapp: d.whatsapp || undefined,
        village: village.trim(),
        taluka: d.taluka.trim(),
        district: d.district.trim(),
        pincode: d.pincode.trim(),
        shopName: d.shopName.trim(),
        about: d.about.trim() || undefined,
        businessType: d.businessType,
        shgName: d.shgName.trim() || undefined,
        yearsInBusiness: d.yearsInBusiness ? Number(d.yearsInBusiness) : undefined,
        monthlyCapacity: d.monthlyCapacity ? Number(d.monthlyCapacity) : undefined,
        sellsFood: !!d.sellsFood,
        fssai: d.sellsFood ? d.fssai : undefined,
        fssaiExpiry: d.sellsFood ? d.fssaiExpiry : undefined,
        upiId: d.upiId.trim(),
        deliveryFee: Number(d.deliveryFee || 0),
        minOrder: Number(d.minOrder || 0),
        dispatch: d.dispatch,
        digital: {
          smartphone: !!d.digital.smartphone,
          internet: !!d.digital.internet,
          upi: !!d.digital.upi,
          whatsappBusiness: !!d.digital.whatsappBusiness,
          socialMedia: !!d.digital.socialMedia,
          digitalMarketing: !!d.digital.digitalMarketing,
        },
      })
      signIn(res.session)
      setCreated(res.seller)
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

  /* ------------------------------------------------------------ */
  /* Done - show her the ID and the score, then send her to pay    */
  /* ------------------------------------------------------------ */
  if (created) {
    return (
      <div className="app-shell">
        <div className="screen screen--nonav stack">
          <div className="center stack-sm" style={{ paddingTop: 'var(--s5)' }}>
            <div style={{ fontSize: '3.5rem' }} aria-hidden="true">🎉</div>
            <h1 className="h1">{t('reg.doneTitle')}</h1>
          </div>

          <Card style={{ textAlign: 'center', borderColor: 'var(--accent)', borderWidth: 2 }}>
            <div className="small dim">{t('reg.yourId')}</div>
            <div
              className="num"
              style={{ fontSize: '1.6rem', fontWeight: 800, letterSpacing: '0.04em', margin: '4px 0' }}
            >
              {created.womenBizId}
            </div>
            <p className="small muted" style={{ margin: 0 }}>{t('reg.idNote')}</p>
          </Card>

          <Card>
            <div className="row-between">
              <div>
                <div className="small dim">{t('reg.readinessTitle')}</div>
                <strong style={{ fontSize: 'var(--t-lg)' }}>
                  {created.readinessScore} / 100
                </strong>
              </div>
              <span className="pill pill--info">
                {lang === 'mr'
                  ? BAND_LABEL[created.readinessBand].mr
                  : BAND_LABEL[created.readinessBand].en}
              </span>
            </div>
            <p className="small dim" style={{ marginBottom: 0 }}>{t('reg.readinessNote')}</p>
          </Card>

          <Notice tone="warn">{t('reg.doneNext')}</Notice>
          <Button onClick={() => nav('/seller/subscription', { replace: true })}>
            {t('reg.payNow')}
          </Button>
          <Button variant="quiet" onClick={() => nav('/seller', { replace: true })}>
            {t('biz.title')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <AppBar
        title={t(STEP_KEYS[step]!)}
        sub={`${t('reg.step')} ${step + 1} ${t('reg.of')} ${STEP_KEYS.length}`}
        onBack={() => (step === 0 ? nav('/join/seller') : setStep((s) => s - 1))}
        right={<AudioHelpButton text={t(STEP_KEYS[step]!)} />}
      />

      <div style={{ padding: '0 var(--s4)' }}>
        <Dots step={step} total={STEP_KEYS.length} />
      </div>

      <div className="screen stack">
        {/* ---------- 1. about her ------------------------------- */}
        {step === 0 && (
          <>
            <Field label={t('reg.name')} hint={t('reg.nameHint')} error={errors.name} required>
              {/* Voice input: she can say her name rather than type Devanagari. */}
              <VoiceInput
                value={d.name}
                onChange={(v) => set('name', v)}
                error={!!errors.name}
                placeholder="सुनीता पाटील"
              />
            </Field>

            <Field label={t('reg.age')} error={errors.age} htmlFor="age">
              <TextInput
                id="age"
                inputMode="numeric"
                maxLength={2}
                value={d.age}
                error={!!errors.age}
                onChange={(e) => set('age', e.target.value.replace(/\D/g, ''))}
                placeholder="35"
              />
            </Field>

            <Field label={t('reg.education')}>
              <div className="wrap-row">
                {EDUCATION_LEVELS.map((lv) => (
                  <button
                    key={lv.value}
                    className={`chip ${d.education === lv.value ? 'chip--on' : ''}`}
                    onClick={() => set('education', lv.value)}
                  >
                    {lang === 'mr' ? lv.mr : lv.en}
                  </button>
                ))}
              </div>
            </Field>

            <Field label={`${t('reg.whatsapp')} (${t('common.optional')})`} hint={t('reg.whatsappHint')} htmlFor="wa">
              <TextInput
                id="wa"
                inputMode="numeric"
                maxLength={10}
                value={d.whatsapp}
                onChange={(e) => set('whatsapp', e.target.value.replace(/\D/g, ''))}
                placeholder={phone}
              />
            </Field>
          </>
        )}

        {/* ---------- 2. village -> her Shanta Mahila Bazar ID --------------- */}
        {step === 1 && (
          <>
            <Field label={t('reg.village')} error={errors.villagePreset} required>
              <div className="stack-sm">
                {VILLAGES.map((v) => (
                  <Choice
                    key={v.code}
                    selected={d.villagePreset === v.mr}
                    onSelect={() => {
                      set('villagePreset', v.mr)
                      set('taluka', v.taluka)
                      set('district', v.district)
                    }}
                    title={v.mr}
                    sub={v.code}
                  />
                ))}
                <Choice
                  selected={d.villagePreset === '__other__'}
                  onSelect={() => set('villagePreset', '__other__')}
                  title={t('reg.villageOther')}
                />
              </div>
            </Field>

            {d.villagePreset === '__other__' && (
              <Field label={t('reg.village')} required>
                <VoiceInput
                  value={d.villageOther}
                  onChange={(v) => set('villageOther', v)}
                  placeholder="गावाचे नाव"
                />
              </Field>
            )}

            {previewId && (
              <Notice tone="ok" title={t('reg.yourId')}>
                <strong className="num" style={{ fontSize: 'var(--t-md)' }}>{previewId}</strong>
                <div className="tiny dim" style={{ marginTop: 2 }}>{t('reg.idNote')}</div>
              </Notice>
            )}

            <div className="row" style={{ gap: 'var(--s3)', alignItems: 'flex-start' }}>
              <Field label={t('reg.taluka')}>
                <TextInput value={d.taluka} onChange={(e) => set('taluka', e.target.value)} />
              </Field>
              <Field label={t('reg.district')}>
                <TextInput value={d.district} onChange={(e) => set('district', e.target.value)} />
              </Field>
            </div>

            <Field
              label={t('reg.pincode')}
              hint={t('reg.pincodeHint')}
              error={errors.pincode}
              required
              htmlFor="pin"
            >
              <TextInput
                id="pin"
                inputMode="numeric"
                maxLength={6}
                value={d.pincode}
                error={!!errors.pincode}
                onChange={(e) => set('pincode', e.target.value.replace(/\D/g, ''))}
                placeholder="413601"
              />
            </Field>
          </>
        )}

        {/* ---------- 3. her business ----------------------------- */}
        {step === 2 && (
          <>
            <Field label={t('reg.shopName')} hint={t('reg.shopNameHint')} error={errors.shopName} required>
              <VoiceInput
                value={d.shopName}
                onChange={(v) => set('shopName', v)}
                error={!!errors.shopName}
                placeholder="सुनीता गृहउद्योग"
              />
            </Field>

            <Field label={t('reg.businessType')} required>
              <div className="stack-sm">
                <Choice selected={d.businessType === 'individual'} onSelect={() => set('businessType', 'individual')} icon="👤" title={t('reg.bizIndividual')} />
                <Choice selected={d.businessType === 'shg'} onSelect={() => set('businessType', 'shg')} icon="👭" title={t('reg.bizShg')} />
                <Choice selected={d.businessType === 'udyam'} onSelect={() => set('businessType', 'udyam')} icon="📄" title={t('reg.bizUdyam')} />
              </div>
            </Field>

            {d.businessType === 'shg' && (
              <Field label={t('reg.shgName')}>
                <VoiceInput value={d.shgName} onChange={(v) => set('shgName', v)} placeholder="जिजाऊ महिला बचत गट" />
              </Field>
            )}

            <div className="row" style={{ gap: 'var(--s3)', alignItems: 'flex-start' }}>
              <Field label={t('reg.years')} htmlFor="yrs">
                <TextInput
                  id="yrs"
                  inputMode="numeric"
                  maxLength={2}
                  value={d.yearsInBusiness}
                  onChange={(e) => set('yearsInBusiness', e.target.value.replace(/\D/g, ''))}
                  placeholder="5"
                />
              </Field>
              <Field label={t('reg.capacity')} hint={t('reg.capacityHint')} htmlFor="cap">
                <TextInput
                  id="cap"
                  inputMode="numeric"
                  value={d.monthlyCapacity}
                  onChange={(e) => set('monthlyCapacity', e.target.value.replace(/\D/g, ''))}
                  placeholder="100"
                />
              </Field>
            </div>

            <Field label={t('reg.about')} hint={t('reg.aboutHint')}>
              <VoiceInput
                value={d.about}
                onChange={(v) => set('about', v)}
                multiline
                placeholder="गेली 12 वर्षे मी घरी लोणची बनवते..."
              />
            </Field>

            <Field label={t('reg.sellsFood')} hint={t('reg.sellsFoodHint')} error={errors.sellsFood} required>
              <YesNo value={d.sellsFood} onChange={(v) => set('sellsFood', v)} />
            </Field>

            {d.sellsFood && (
              <>
                <Notice tone="warn">{t('prod.fssaiWhy')}</Notice>
                <Field label={t('reg.fssai')} hint={t('reg.fssaiHint')} error={errors.fssai} required htmlFor="fssai">
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
                <Field label={t('reg.fssaiExpiry')} error={errors.fssaiExpiry} required htmlFor="fx">
                  <TextInput
                    id="fx"
                    type="date"
                    value={d.fssaiExpiry}
                    error={!!errors.fssaiExpiry}
                    onChange={(e) => set('fssaiExpiry', e.target.value)}
                  />
                </Field>
              </>
            )}
          </>
        )}

        {/* ---------- 4. digital readiness ------------------------ */}
        {step === 3 && (
          <>
            <div className="stack-sm">
              <h2 className="h2">{t('reg.digitalTitle')}</h2>
              <p className="small muted">{t('reg.digitalHint')}</p>
            </div>

            {SELF_REPORTED_FACTORS.map((f) => (
              <Field key={f.key} label={lang === 'mr' ? f.mr : f.en}>
                <YesNo
                  value={d.digital[f.key] ?? null}
                  onChange={(v) => set('digital', { ...d.digital, [f.key]: v })}
                />
              </Field>
            ))}

            {errors.digital && <div className="field__err">⚠ {errors.digital}</div>}

            {answered === SELF_REPORTED_FACTORS.length && (
              <Card>
                <div className="row-between">
                  <div>
                    <div className="small dim">{t('reg.readinessTitle')}</div>
                    <strong style={{ fontSize: 'var(--t-lg)' }}>{score} / 100</strong>
                  </div>
                  <span className="pill pill--info">
                    {lang === 'mr'
                      ? BAND_LABEL[readinessBand(score)].mr
                      : BAND_LABEL[readinessBand(score)].en}
                  </span>
                </div>
                <p className="small dim" style={{ marginBottom: 0 }}>{t('reg.readinessNote')}</p>
              </Card>
            )}
          </>
        )}

        {/* ---------- 5. money in --------------------------------- */}
        {step === 4 && (
          <>
            <div className="stack-sm">
              <h2 className="h2">{t('reg.upiTitle')}</h2>
              <Notice tone="warn">{t('reg.upiHint')}</Notice>
            </div>

            <Field
              label={t('reg.upiLabel')}
              hint={t('reg.upiWhere')}
              error={errors.upiId}
              required
              htmlFor="upi"
            >
              <TextInput
                id="upi"
                value={d.upiId}
                error={!!errors.upiId}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                onChange={(e) => set('upiId', e.target.value.trim())}
                placeholder={t('reg.upiPlaceholder')}
              />
            </Field>

            {isValidUpi(d.upiId) && (
              <Notice tone="ok">
                ✓ <strong className="num">{d.upiId}</strong>
              </Notice>
            )}

            <div className="row" style={{ gap: 'var(--s3)', alignItems: 'flex-start' }}>
              <Field label={t('reg.deliveryFee')} hint={t('reg.deliveryFeeHint')} htmlFor="df">
                <TextInput
                  id="df"
                  inputMode="numeric"
                  value={d.deliveryFee}
                  onChange={(e) => set('deliveryFee', e.target.value.replace(/\D/g, ''))}
                />
              </Field>
              <Field label={t('reg.minOrder')} htmlFor="mo">
                <TextInput
                  id="mo"
                  inputMode="numeric"
                  value={d.minOrder}
                  onChange={(e) => set('minOrder', e.target.value.replace(/\D/g, ''))}
                />
              </Field>
            </div>

            <Field label={t('reg.dispatch')} required>
              <div className="stack-sm">
                <Choice selected={d.dispatch === 'same'} onSelect={() => set('dispatch', 'same')} title={t('reg.dispatchSame')} />
                <Choice selected={d.dispatch === '1'} onSelect={() => set('dispatch', '1')} title={t('reg.dispatch1')} />
                <Choice selected={d.dispatch === '23'} onSelect={() => set('dispatch', '23')} title={t('reg.dispatch23')} />
              </div>
            </Field>
          </>
        )}

        {/* ---------- 6. review ----------------------------------- */}
        {step === 5 && (
          <>
            <h2 className="h2">{t('reg.reviewTitle')}</h2>

            {previewId && (
              <Card style={{ textAlign: 'center', borderColor: 'var(--accent)', borderWidth: 2 }}>
                <div className="small dim">{t('reg.yourId')}</div>
                <div className="num" style={{ fontSize: '1.4rem', fontWeight: 800 }}>{previewId}</div>
                <div className="tiny dim">{villageCode(village)}</div>
              </Card>
            )}

            <Card>
              <div className="stack-sm small">
                <Row label={t('reg.name')} value={d.name} />
                <Row label={t('reg.age')} value={d.age} />
                <Row label={t('reg.village')} value={village} />
                <Row label={t('reg.pincode')} value={d.pincode} />
                <Row label={t('reg.shopName')} value={d.shopName} />
                <Row label={t('reg.businessType')} value={t(`reg.biz${d.businessType === 'shg' ? 'Shg' : d.businessType === 'udyam' ? 'Udyam' : 'Individual'}`)} />
                {d.shgName && <Row label={t('reg.shgName')} value={d.shgName} />}
                {d.yearsInBusiness && <Row label={t('reg.years')} value={`${d.yearsInBusiness} ${t('reg.yearsUnit')}`} />}
                {d.monthlyCapacity && <Row label={t('reg.capacity')} value={d.monthlyCapacity} />}
                <Row label={t('reg.sellsFood')} value={d.sellsFood ? t('common.yes') : t('common.no')} />
                {d.sellsFood && <Row label={t('reg.fssai')} value={d.fssai} />}
                <Row label={t('reg.upiLabel')} value={d.upiId} />
                <Row label={t('reg.deliveryFee')} value={<Rupees value={Number(d.deliveryFee || 0)} />} />
              </div>
            </Card>

            <Card>
              <div className="row-between">
                <span className="small dim">{t('reg.readinessTitle')}</span>
                <strong>{score} / 100 · {lang === 'mr' ? BAND_LABEL[readinessBand(score)].mr : BAND_LABEL[readinessBand(score)].en}</strong>
              </div>
            </Card>

            {serverError && <Notice tone="danger">{serverError}</Notice>}
          </>
        )}
      </div>

      <div className="actionbar">
        {step < STEP_KEYS.length - 1 ? (
          <Button onClick={next}>{t('common.next')} →</Button>
        ) : (
          <Button onClick={submit} disabled={busy}>
            {busy ? t('common.loading') : t('reg.submit')}
          </Button>
        )}
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="row-between">
      <span className="dim">{label}</span>
      <span style={{ fontWeight: 600, textAlign: 'right' }}>{value || '—'}</span>
    </div>
  )
}
