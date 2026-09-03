import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { Product, Seller } from '@shared/types.js'
import { useI18n, useT } from '../../i18n/I18nProvider.js'
import { useCart } from '../../store/CartContext.js'
import { api } from '../../lib/api.js'
import {
  AppBar, Button, Card, EmptyState, Loading, Notice, Pill,
  Rupees, SectionTitle, Stepper, TextInput, useAsync,
} from '../../components/ui.js'

function ProductCard({ product, onOpen }: { product: Product; onOpen: () => void }) {
  return (
    <button className="pcard" onClick={onOpen}>
      <div className="pcard__img" aria-hidden="true">{product.emoji}</div>
      <div className="pcard__body">
        <div className="pcard__name">{product.name}</div>
        <div className="pcard__price"><Rupees value={product.price} /></div>
      </div>
    </button>
  )
}

export function Explore() {
  const t = useT()
  const nav = useNavigate()
  const { lang } = useI18n()
  const [q, setQ] = useState('')

  const [data, loading] = useAsync(() => api.catalog(), [])
  const [catData] = useAsync(() => api.categories(), [])

  const products = data?.products ?? []
  const list = products.filter((p) =>
    !q.trim() ? true : (p.name + (p.nameEn ?? '')).toLowerCase().includes(q.toLowerCase()),
  )

  return (
    <>
      <AppBar title={t('app.name')} sub={t('app.tagline')} />
      <div className="screen stack">
        <TextInput
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`🔍 ${t('cus.searchPlaceholder')}`}
          aria-label={t('common.search')}
        />

        <div className="hscroll">
          {(catData?.categories ?? []).slice(0, 8).map((c) => (
            <button
              key={c.id}
              className="card card--tap"
              style={{ width: 96, textAlign: 'center', padding: 'var(--s3)' }}
              onClick={() => nav(`/shop/c/${c.id}`)}
            >
              <div style={{ fontSize: '1.75rem' }} aria-hidden="true">{c.icon}</div>
              <div className="tiny" style={{ fontWeight: 600, marginTop: 4 }}>
                {lang === 'mr' ? c.mr : c.en}
              </div>
            </button>
          ))}
        </div>

        <div>
          <SectionTitle>{q ? t('common.search') : t('cus.homemade')}</SectionTitle>
          {loading ? (
            <Loading />
          ) : list.length === 0 ? (
            <EmptyState icon="🔍" title={t('prod.noProducts')} />
          ) : (
            <div className="pgrid">
              {list.map((p) => (
                <ProductCard key={p.id} product={p} onOpen={() => nav(`/shop/p/${p.id}`)} />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

export function Categories() {
  const t = useT()
  const nav = useNavigate()
  const { lang } = useI18n()
  const [data, loading] = useAsync(() => api.categories(), [])

  return (
    <>
      <AppBar title={t('nav.categories')} />
      <div className="screen">
        {loading ? (
          <Loading />
        ) : (
          <div className="pgrid">
            {(data?.categories ?? []).map((c) => (
              <button
                key={c.id}
                className="card card--tap"
                style={{ textAlign: 'center' }}
                onClick={() => nav(`/shop/c/${c.id}`)}
              >
                <div style={{ fontSize: '2.25rem' }} aria-hidden="true">{c.icon}</div>
                <div style={{ fontWeight: 700, marginTop: 6 }}>{lang === 'mr' ? c.mr : c.en}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

export function CategoryProducts() {
  const { categoryId } = useParams()
  const t = useT()
  const nav = useNavigate()
  const { lang } = useI18n()

  const [data, loading] = useAsync(() => api.catalog({ categoryId }), [categoryId])
  const [catData] = useAsync(() => api.categories(), [])
  const cat = (catData?.categories ?? []).find((c) => c.id === categoryId)
  const products = data?.products ?? []

  return (
    <>
      <AppBar
        title={cat ? (lang === 'mr' ? cat.mr : cat.en) : t('nav.categories')}
        backTo="/shop/categories"
      />
      <div className="screen">
        {loading ? (
          <Loading />
        ) : products.length === 0 ? (
          <EmptyState icon="📭" title={t('prod.noProducts')} />
        ) : (
          <div className="pgrid">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} onOpen={() => nav(`/shop/p/${p.id}`)} />
            ))}
          </div>
        )}
      </div>
    </>
  )
}

export function ProductDetail() {
  const { productId } = useParams()
  const t = useT()
  const nav = useNavigate()
  const { add, has } = useCart()
  const [qty, setQty] = useState(1)

  const [data, loading] = useAsync(() => api.product(productId!), [productId])

  if (loading) {
    return <><AppBar title="" onBack={() => nav(-1)} /><div className="screen"><Loading /></div></>
  }
  if (!data) {
    return <><AppBar title="" onBack={() => nav(-1)} /><div className="screen"><EmptyState title="—" /></div></>
  }

  const { product, seller } = data
  const outOfStock = !product.madeToOrder && product.stock === 0

  return (
    <>
      <AppBar title={product.name} onBack={() => nav(-1)} />
      <div className="screen stack">
        <div
          style={{
            aspectRatio: 1, background: 'var(--surface-2)', borderRadius: 'var(--r-lg)',
            display: 'grid', placeItems: 'center', fontSize: '6rem',
            border: '1px solid var(--line)', maxWidth: 420, margin: '0 auto', width: '100%',
          }}
          aria-hidden="true"
        >
          {product.emoji}
        </div>

        <div className="stack-sm">
          <h1 className="h2">{product.name}</h1>
          <div className="row" style={{ gap: 'var(--s3)', flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 'var(--t-xl)' }}><Rupees value={product.price} /></strong>
            {product.mrp > product.price && (
              <span className="dim" style={{ textDecoration: 'line-through' }}>
                <Rupees value={product.mrp} />
              </span>
            )}
            <span className="dim">/ {t(`unit.${product.unit}`)}</span>
          </div>
          <div className="wrap-row">
            {product.isFood && product.vegType && (
              <Pill tone={product.vegType === 'veg' ? 'ok' : 'danger'}>
                {product.vegType === 'veg' ? '🟢' : '🔴'}{' '}
                {product.vegType === 'veg' ? t('cus.veg') : t('cus.nonveg')}
              </Pill>
            )}
            <Pill tone={outOfStock ? 'danger' : 'ok'}>
              {outOfStock ? t('prod.outOfStock') : t('prod.inStock')}
            </Pill>
          </div>
        </div>

        {seller && <SellerCard seller={seller} />}

        {/* The FSSAI number on a food listing is a legal requirement. */}
        {product.isFood ? (
          <Card>
            <div className="stack-sm small">
              <div>
                <span className="dim">{t('cus.ingredients')}: </span>
                {product.ingredients}
              </div>
              {(product.fssai ?? seller?.fssai) && (
                <div>
                  <span className="dim">{t('cus.fssaiNo')}: </span>
                  <span className="num">{product.fssai ?? seller?.fssai}</span>
                </div>
              )}
            </div>
          </Card>
        ) : (
          product.material && (
            <Card>
              <div className="small">
                <span className="dim">{t('cus.material')}: </span>
                {product.material}
              </div>
            </Card>
          )
        )}

        {seller && (
          <Notice tone="info">
            {t('cus.deliveryFee')}: <Rupees value={seller.deliveryFee} />
            {seller.freeDeliveryAbove > 0 && <> · ₹{seller.freeDeliveryAbove}+ मोफत</>}
          </Notice>
        )}
      </div>

      <div className="actionbar">
        {!outOfStock && (
          <div className="row-between">
            <span style={{ fontWeight: 600 }}>{t('prod.stock')}</span>
            <Stepper value={qty} onChange={setQty} max={product.madeToOrder ? 20 : product.stock} />
          </div>
        )}
        <Button
          disabled={outOfStock}
          onClick={() => { add(product, qty); nav('/shop/cart') }}
        >
          {outOfStock ? t('prod.outOfStock') : `🧺 ${t('cus.addToCart')}`}
          {has(product.id) ? ' ✓' : ''}
        </Button>
      </div>
    </>
  )
}

function SellerCard({ seller }: { seller: Partial<Seller> }) {
  const t = useT()
  const nav = useNavigate()
  return (
    <button className="tile" onClick={() => nav(`/shop/s/${seller.shopSlug}`)}>
      <div className="tile__img" aria-hidden="true">{seller.photo}</div>
      <div className="tile__body">
        <div className="tile__meta">{t('cus.soldBy')}</div>
        <div className="tile__title">{seller.shopName}</div>
        <div className="tile__meta">
          ⭐ {seller.rating} ({seller.ratingCount}) · {seller.village}
        </div>
        <div className="tiny num dim">{seller.womenBizId}</div>
      </div>
      <span aria-hidden="true">›</span>
    </button>
  )
}

/** Seller storefront - where her share QR lands. */
export function SellerStore() {
  const { slug } = useParams()
  const t = useT()
  const nav = useNavigate()
  const { add } = useCart()

  const [sellerData, loadingSeller] = useAsync(() => api.sellerBySlug(slug!), [slug])
  const [catalogData, loadingCatalog] = useAsync(() => api.catalog(), [])

  if (loadingSeller || loadingCatalog) {
    return <><AppBar title="" onBack={() => nav(-1)} /><div className="screen"><Loading /></div></>
  }
  if (!sellerData) {
    return <><AppBar title="" onBack={() => nav(-1)} /><div className="screen"><EmptyState title="—" /></div></>
  }

  const seller = sellerData.seller
  const products = (catalogData?.products ?? []).filter((p) => p.sellerId === seller.id)

  // Devanagari initial: take the first letter WITH its vowel sign. A plain
  // slice(0,1) on सुनीता yields स and drops the matra, which is not how the
  // name starts. This keeps the whole cluster: सु.
  const initial = /^.[ऀ-ःऺ-ॏ॑-ॗॢॣ]*/
    .exec(seller.name ?? '')?.[0] ?? ''

  // Filled and empty stars, so the rating reads without relying on colour.
  const filled = Math.round(seller.rating)
  const stars = '★'.repeat(filled) + '☆'.repeat(Math.max(0, 5 - filled))

  return (
    <>
      <AppBar title={t('app.name')} onBack={() => nav(-1)} />

      <div className="screen stack">
        {/* --- her shop card: banner, identity, then the ID badge --- */}
        <div className="shopcard">
          <div className="shopcard__band">
            <div className="shop-avatar" aria-hidden="true">
              {initial}
            </div>
            <div className="grow">
              <h1 className="shopcard__name">{seller.name}</h1>
              <p className="shopcard__meta">
                📍 {seller.village} · {seller.shopName}
              </p>
              <p className="shopcard__meta">
                <span className="stars" aria-hidden="true">{stars}</span>{' '}
                <span className="dim">({seller.ratingCount})</span>
              </p>
            </div>
          </div>

          <div className="shopcard__foot">
            {/* Her ID goes on her packaging, so it is shown here, not hidden. */}
            <span className="idpill">{seller.womenBizId}</span>
            <span className="verified">
              <span aria-hidden="true">✓</span> {t('cus.verifiedSeller')}
            </span>
          </div>
        </div>

        {seller.about && (
          <Card>
            <p className="small muted" style={{ margin: 0 }}>{seller.about}</p>
          </Card>
        )}

        {/* --- her products ---------------------------------------- */}
        <div>
          <div className="sec-head">
            <h2 className="sec-head__t">
              {t('cus.herProducts')} ({products.length})
            </h2>
          </div>

          {products.length === 0 ? (
            <Card><EmptyState icon="📦" title={t('prod.noProducts')} /></Card>
          ) : (
            <div className="stack-sm">
              {products.map((p) => (
                <Card key={p.id} style={{ padding: 0, overflow: 'hidden' }}>
                  <button
                    className="prow"
                    onClick={() => nav(`/shop/p/${p.id}`)}
                    style={{
                      background: 'none', border: 0, width: '100%',
                      font: 'inherit', color: 'inherit', textAlign: 'left', cursor: 'pointer',
                    }}
                  >
                    <span className="prow__img" aria-hidden="true">{p.emoji}</span>
                    <span className="prow__body">
                      <span className="prow__name">{p.name}</span>
                      <span className="prow__meta">
                        {p.madeToOrder
                          ? t('prod.madeToOrder')
                          : `${p.stock} ${t(`unit.${p.unit}`)}`}
                        {' · '}
                        {p.isFood ? t('cus.homemade') : (p.material ?? '')}
                      </span>
                      <span className="prow__price">
                        <Rupees value={p.price} /> <span>/ {t(`unit.${p.unit}`)}</span>
                      </span>
                    </span>
                  </button>

                  <div className="prow__actions">
                    <Button onClick={() => { add(p, 1); nav('/shop/cart') }}>
                      🛒 {t('cus.buyNow')}
                    </Button>
                    <a
                      className="btn btn--ghost"
                      href={`https://wa.me/?text=${encodeURIComponent(`${p.name} — ${seller.shopName}`)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      💬 WhatsApp
                    </a>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
