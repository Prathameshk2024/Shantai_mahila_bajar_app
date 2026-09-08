import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useT } from '../i18n/I18nProvider.js'
import { useCart } from '../store/CartContext.js'
import { api } from '../lib/api.js'
import { useAsync } from './ui.js'

interface NavItem {
  to: string
  end?: boolean
  icon: string
  label: string
  badge?: number
}

function BottomNav({ items }: { items: NavItem[] }) {
  return (
    <nav className="bottomnav" aria-label="Main">
      {items.map((it) => (
        <NavLink key={it.to} to={it.to} end={it.end} className={({ isActive }) => `bottomnav__item ${isActive ? 'bottomnav__item--on' : ''}`}>
          <span className="bottomnav__icon" aria-hidden="true">
            {it.icon}
            {!!it.badge && it.badge > 0 && <span className="bottomnav__badge">{it.badge}</span>}
          </span>
          <span className="bottomnav__label">{it.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}

export function SellerLayout() {
  const t = useT()
  return <div className="app-shell"><Outlet /><BottomNav items={[
    { to: '/seller', end: true, icon: '🏪', label: t('nav.business') },
    { to: '/seller/upload', icon: '➕', label: t('nav.upload') },
    { to: '/seller/profile', icon: '👤', label: t('nav.profile') },
    { to: '/seller/help', icon: '🎓', label: t('nav.help') },
  ]} /></div>
}

export function CustomerLayout() {
  const t = useT()
  const { count } = useCart()
  const location = useLocation()
  const match = location.pathname.match(/^\/shop\/orders\/([^/]+)$/)
  const [orderData] = useAsync(() => match ? api.order(match[1]) : Promise.resolve(null), [match?.[1]])
  const phone = orderData?.seller?.phone

  return (
    <div className="app-shell">
      <Outlet />
      {phone && (
        <div style={{ padding: '0 var(--s3) var(--s2)' }}>
          <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--s3)' }}>
            <div><div className="small dim">विक्रेतीशी संपर्क</div><strong className="num">+91 {phone}</strong></div>
            <a className="btn btn--quiet btn--sm" href={`tel:+91${phone}`}>📞 कॉल करा</a>
          </div>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'center', padding: '0 var(--s3) var(--s2)' }}>
        <NavLink className="btn btn--quiet btn--sm" to="/shop/feedback">⭐ Feedback</NavLink>
      </div>
      <BottomNav items={[
        { to: '/shop', end: true, icon: '🔍', label: t('nav.explore') },
        { to: '/shop/categories', icon: '🗂️', label: t('nav.categories') },
        { to: '/shop/cart', icon: '🧺', label: t('nav.cart'), badge: count },
        { to: '/shop/profile', icon: '👤', label: t('nav.myProfile') },
      ]} />
    </div>
  )
}
