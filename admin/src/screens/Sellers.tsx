import { useMemo, useState } from 'react'
import type { SellerStatus } from '@shared/types.js'
import { PLAN } from '@shared/seller.js'
import { useT } from '../i18n/I18nProvider.js'
import { IconSellers } from '../components/icons.js'
import { api, type SellerRow } from '../lib/api.js'
import { TopBar } from '../components/Shell.js'
import { Confirm, PackPicker, useConfirm } from '../components/Confirm.js'
import {
  Button, Card, CopyValue, EmptyState, ErrorNote, Loading, Pill, useAsync, useErrorText,
} from '../components/ui.js'

/**
 * The register of women on the programme.
 *
 * Nothing here deletes anybody, and nothing here happens on a single click.
 * Every action changes what a real woman can do tomorrow - her slot
 * allowance, or whether her shop is visible at all - so each one states its
 * consequence and waits for a second confirmation.
 */
export function Sellers() {
  const t = useT()
  const [q, setQ] = useState('')
  const [data, loading, error, reload] = useAsync(() => api.sellers(), [])

  const rows = useMemo(() => {
    const all = data?.sellers ?? []
    const needle = q.trim().toLowerCase()
    if (!needle) return all
    return all.filter((s) =>
      [s.name, s.shopName, s.village, s.phone, s.womenBizId]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle)),
    )
  }, [data, q])

  return (
    <>
      <TopBar title={t('se.title')} sub={data ? `${data.sellers.length}` : undefined} />
      <div className="body stack">
        <input
          className="input"
          style={{ maxWidth: 320 }}
          placeholder={t('se.searchHint')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        <ErrorNote error={error} />

        {loading ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Card><EmptyState icon={IconSellers} title={t('se.empty')} body={t('se.emptySub')} /></Card>
        ) : (
          <div className="stack-sm">
            {rows.map((s) => <SellerCard key={s.id} seller={s} onDone={reload} />)}
          </div>
        )}
      </div>
    </>
  )
}

type Action = 'grant' | 'revoke' | 'block' | null

function SellerCard({ seller, onDone }: { seller: SellerRow; onDone: () => void }) {
  const t = useT()
  const errorText = useErrorText()
  const c = useConfirm()

  const [action, setAction] = useState<Action>(null)
  const [packs, setPacks] = useState(1)
  const [blockReason, setBlockReason] = useState('')

  const blocked = seller.status === 'BLOCKED'
  const used = seller.slots?.used ?? 0
  const slotsPerPack = PLAN.slotsPerPack

  function ask(next: Exclude<Action, null>) {
    setAction(next)
    setPacks(1)
    setBlockReason('')
    c.ask()
  }

  function close() {
    setAction(null)
    c.close()
  }

  async function run(fn: () => Promise<unknown>) {
    c.setBusy(true)
    c.setError('')
    try {
      await fn()
      close()
      onDone()
    } catch (e) {
      // Stays open on failure: the server refuses a revoke that would drop her
      // below the slots she is using, and that message is the whole point.
      c.setError(errorText(e))
    } finally {
      c.setBusy(false)
    }
  }

  return (
    <Card>
      <div className="row wrap" style={{ gap: 12, alignItems: 'flex-start' }}>
        <div className="grow">
          <div className="row wrap" style={{ gap: 8 }}>
            {/* Her name and shop name exactly as she entered them. */}
            <span className="strong">{seller.name}</span>
            <span className="dim">{seller.shopName}</span>
            <StatusPill status={seller.status} />
          </div>
          <div className="small dim">
            <span className="mono">{seller.womenBizId}</span>
            {' · '}{t('se.village')}: {seller.village}
            {' · '}<span className="mono">{seller.phone}</span>
          </div>
          <div className="small dim-2">
            {t('se.slots')}: <span className="num">{used}/{seller.slots?.total ?? 0}</span>
            {' · '}{seller.packsApproved} {t('se.packs')}
            {' · '}{t('se.products')}: <span className="num">{seller.productCount}</span>
            {' · '}{t('se.readiness')}: <span className="num">{seller.readinessScore}</span>
          </div>

          {/* Where her money goes. Read off this screen when a payout is made
              by hand, so it is copied rather than retyped. */}
          {seller.upiId && (
            <div className="small dim">
              {t('se.upi')}{' '}
              <CopyValue value={seller.upiId} label={t('c.copy')} copiedText={t('c.upiCopied')} />
            </div>
          )}
          {seller.blockReason && (
            <div className="small" style={{ color: 'var(--danger)' }}>
              {t('c.reason')}: {seller.blockReason}
            </div>
          )}
        </div>

        <div className="row wrap">
          <Button variant="quiet" small disabled={c.open} onClick={() => ask('grant')}>
            + {t('se.grantSlots')}
          </Button>
          <Button variant="quiet" small disabled={c.open} onClick={() => ask('revoke')}>
            − {t('se.revoke')}
          </Button>
          <Button
            variant={blocked ? 'ok' : 'danger'}
            small
            disabled={c.open}
            onClick={() => ask('block')}
          >
            {blocked ? t('se.unblock') : t('se.block')}
          </Button>
        </div>
      </div>

      {/* ---- grant ---- */}
      <Confirm
        open={c.open && action === 'grant'}
        title={t('se.grantTitle')}
        description={t('se.grantDesc', { n: packs, slots: packs * slotsPerPack })}
        confirmLabel={t('se.grantConfirm')}
        busy={c.busy}
        error={c.error}
        onCancel={close}
        onConfirm={() => void run(() => api.grantSlots(seller.id, packs))}
      >
        <PackPicker value={packs} onChange={setPacks} />
      </Confirm>

      {/* ---- revoke ---- */}
      <Confirm
        open={c.open && action === 'revoke'}
        title={seller.packsApproved > 0 ? t('se.revokeTitle') : t('se.revokeNoneTitle')}
        description={
          seller.packsApproved > 0
            ? t('se.revokeDesc', { n: packs, slots: packs * slotsPerPack, used })
            : t('se.revokeNoneDesc')
        }
        confirmLabel={t('se.revokeConfirm')}
        tone="danger"
        busy={c.busy}
        error={c.error}
        onCancel={close}
        onConfirm={() => void run(() => api.revokeSlots(seller.id, packs))}
      >
        {seller.packsApproved > 0 && (
          <PackPicker value={packs} onChange={setPacks} max={seller.packsApproved} />
        )}
      </Confirm>

      {/* ---- block / unblock ---- */}
      <Confirm
        open={c.open && action === 'block'}
        title={blocked ? t('se.unblockTitle') : t('se.blockTitle')}
        description={blocked ? t('se.unblockDesc') : t('se.blockDesc')}
        confirmLabel={blocked ? t('se.unblockConfirmBtn') : t('se.blockConfirmBtn')}
        tone={blocked ? 'primary' : 'danger'}
        busy={c.busy}
        error={c.error}
        onCancel={close}
        onConfirm={() => void run(() => api.blockSeller(seller.id, !blocked, blockReason.trim()))}
      >
        {!blocked && (
          <div style={{ marginTop: 10 }}>
            <label className="field__l">{t('se.blockReason')}</label>
            <textarea
              className="textarea"
              value={blockReason}
              onChange={(e) => setBlockReason(e.target.value)}
            />
          </div>
        )}
      </Confirm>
    </Card>
  )
}

function StatusPill({ status }: { status: SellerStatus }) {
  const t = useT()
  const tone =
    status === 'ACTIVE' ? 'ok'
      : status === 'PAYMENT_SUBMITTED' ? 'warn'
        : status === 'BLOCKED' || status === 'PAYMENT_REJECTED' ? 'danger'
          : 'neutral'
  return <Pill tone={tone}>{t(`st.${status}`)}</Pill>
}
