import { NavLink, Outlet } from 'react-router-dom'
import { useT } from '../i18n/I18nProvider.js'
import { useCart } from '../store/CartContext.js'

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
        <NavLink
          key={it.to}
          to={it.to}
          end={it.end}
          className={({ isActive }) => `bottomnav__item ${isActive ? 'bottomnav__item--on' : ''}`}
        >
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
  return (
    <div className="app-shell">
      <Outlet />
      <BottomNav items={[
        { to: '/seller', end: true, icon: '🏪', label: t('nav.business') },
        { to: '/seller/upload', icon: '➕', label: t('nav.upload') },
        { to: '/seller/profile', icon: '👤', label: t('nav.profile') },
        { to: '/seller/help', icon: '🎓', label: t('nav.help') },
      ]} />
    </div>
  )
}

export function CustomerLayout() {
  const t = useT()
  const { count } = useCart()
  return (
    <div className="app-shell">
      <Outlet />
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
