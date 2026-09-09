import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { Product, Seller } from '@shared/types.js'
import { useI18n, useT } from '../../i18n/I18nProvider.js'
import { useCart } from '../../store/CartContext.js'
import ProductImage from '../../components/ProductImage.js'
import { Avatar } from '../../components/Avatar.js'
import { api } from '../../lib/api.js'
import {
  AppBar, Button, Card, EmptyState, Loading, Notice, Pill,
  Rupees, SectionTitle, Stepper, TextInput, useAsync,
} from '../../components/ui.js'
import {
  IconCart, IconCheck, IconProduct, IconSearch, IconStar,
} from '../../components/icons.js'
import { PageTour } from '../../components/Walkthrough.js'

function ProductCard({ product, onOpen }: { product: Product; onOpen: () => void }) {
  return (
    <button className="pcard" onClick={onOpen}>
      <ProductImage src={product.imageUrl} emoji={product.emoji} className="pcard__img" rounded="0" />
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

  // Deliberately NOT filtered by pincode. Browsing is for discovery, and a
  // pincode filter here hid whole shops behind a setting most shoppers never
  // touched. Serviceability is checked where it actually matters - at
  // checkout, and per seller, where it can be explained rather than silently
  // shortening the list.
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
          data-wt="ex-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`🔍 ${t('cus.searchPlaceholder')}`}
          aria-label={t('common.search')}
        />

        <div className="hscroll" data-wt="ex-cats">
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

        <div data-wt="ex-grid">
          <SectionTitle>{q ? t('common.search') : t('cus.homemade')}</SectionTitle>
          {loading ? (
            <Loading />
          ) : list.length === 0 ? (
            <EmptyState icon={IconSearch} title={t('prod.noProducts')} />
          ) : (
            <div className="pgrid">
              {list.map((p) => (
                <ProductCard key={p.id} product={p} onOpen={() => nav(`/shop/p/${p.id}`)} />
              ))}
            </div>
          )}
        </div>
      </div>

      <PageTour id="shop.explore" />
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
      <div className="screen" data-wt="cat-grid">
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

      <PageTour id="shop.categories" />
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
          <EmptyState icon={IconProduct} title={t('prod.noProducts')} />
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
        <div style={{ maxWidth: 420, margin: '0 auto', width: '100%' }}>
          <ProductImage
            src={product.imageUrl}
            emoji={product.emoji}
            rounded="var(--r-lg)"
          />
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

        {product.isFood ? (
          <Card>
            <div className="stack-sm small">
              <div>
                <span className="dim">{t('cus.ingredients')}: </span>
                {product.ingredients}
              </div>
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
            {seller.freeDeliveryAbove > 0 && <> · ₹{seller.freeDeliveryAbove}+ {t('cart.free')}</>}
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
          {outOfStock ? t('prod.outOfStock') : <><IconCart aria-hidden="true" /> {t('cus.addToCart')}</>}
          {has(product.id) && <IconCheck aria-hidden="true" />}
        </Button>
      </div>
    </>
  )
}

/**
 * Who made this. Not a link any more - the public storefront it opened was
 * the landing page for the share QR, and that whole surface is gone. Her name,
 * her village and her SMB ID still belong on the product, because they are
 * what a buyer is choosing between.
 */
function SellerCard({ seller }: { seller: Partial<Seller> }) {
  const t = useT()
  return (
    <div className="tile">
      <Avatar name={seller.name} size={62} />
      <div className="tile__body">
        <div className="tile__meta">{t('cus.soldBy')}</div>
        <div className="tile__title">{seller.shopName}</div>
        <div className="tile__meta">
          <IconStar aria-hidden="true" /> {seller.rating} ({seller.ratingCount}) · {seller.village}
        </div>
        <div className="tiny num dim">{seller.womenBizId}</div>
      </div>
    </div>
  )
}
