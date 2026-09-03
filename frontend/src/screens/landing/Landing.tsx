import { useNavigate } from 'react-router-dom'
import { useI18n, useT } from '../../i18n/I18nProvider.js'
import HeroArt from './HeroArt.js'

/**
 * The public landing page — the only full-width surface in the app.
 *
 * Its single job is to send two very different people through two different
 * doors: a woman who wants to sell, and a shopper who wants to buy. Both doors
 * appear above the fold and again at the bottom, because on a phone a long
 * page loses the top.
 *
 * Everything else exists to make a first-time visitor trust it, so the copy
 * leads with the problem in her own words rather than with platform features.
 */
export default function Landing() {
  const t = useT()
  const { lang, setLang, langs } = useI18n()
  const nav = useNavigate()

  const goSell = () => nav('/join/seller')
  const goBuy = () => nav('/join/customer')

  return (
    <div className="landing">
      {/* ---------------------------------------------------------- */}
      {/* 1. Header                                                    */}
      {/* ---------------------------------------------------------- */}
      <header className="lnav">
        <div className="wrap lnav__in">
          <div className="brand">
            <span className="brand__mark" aria-hidden="true">शां</span>
            <span>
              <span className="brand__name">
                शांता <em>महिला बाजार</em>
              </span>
              <span className="brand__sub">Shanta Mahila Bazar</span>
            </span>
          </div>

          <div className="grow" />

          {/* Language sits in the header, never buried in settings. */}
          <div className="langswitch">
            {langs.map((l) => (
              <button
                key={l.code}
                onClick={() => setLang(l.code)}
                aria-pressed={lang === l.code}
              >
                {l.label}
              </button>
            ))}
          </div>

          <button className="lnav__login" onClick={() => nav('/login/seller')}>
            {t('lp.loginShort')}
          </button>
        </div>
      </header>

      {/* ---------------------------------------------------------- */}
      {/* 2. Hero                                                      */}
      {/* ---------------------------------------------------------- */}
      <section className="hero">
        <div className="wrap hero__in">
          <div>
            <span className="hero__eyebrow">
              <span aria-hidden="true">●</span> {t('lp.eyebrow')}
            </span>

            <h1>
              {t('lp.heroA')}
              <br />
              <em>{t('lp.heroB')}</em>
            </h1>

            <p className="hero__lede">{t('lp.heroLede')}</p>

            <div className="doors">
              <button className="door door--primary" onClick={goSell}>
                <span className="door__icon" aria-hidden="true">🧺</span>
                <span className="grow">
                  <span className="door__t">{t('lp.ctaSell')}</span>
                  <span className="door__s">{t('lp.sellerDoorSub')}</span>
                </span>
              </button>

              <button className="door" onClick={goBuy}>
                <span className="door__icon" aria-hidden="true">🛍️</span>
                <span className="grow">
                  <span className="door__t">{t('lp.ctaBuy')}</span>
                  <span className="door__s">{t('lp.customerDoorSub')}</span>
                </span>
              </button>
            </div>
          </div>

          <figure className="hero__art">
            <HeroArt />
            <figcaption>
              <strong>{t('lp.artName')}</strong>
              {t('lp.artCaption')}
            </figcaption>
          </figure>
        </div>
      </section>

      {/* ---------------------------------------------------------- */}
      {/* 3. How it works — two lanes, four steps each                 */}
      {/* ---------------------------------------------------------- */}
      <section className="lsection lsection--tint">
        <div className="wrap">
          <div className="lsection__head">
            <h2>{t('lp.howTitle')}</h2>
            <p>{t('lp.howLede')}</p>
          </div>

          <div className="lanes">
            <div className="lane">
              <h3 className="lane__t">
                <span aria-hidden="true">👩</span> {t('lp.forSellers')}
              </h3>
              <ol className="steps">
                {[t('lp.s1'), t('lp.s2'), t('lp.s3'), t('lp.s4')].map((step, i) => (
                  <li key={step}>
                    <b>{i + 1}</b>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="lane lane--buy">
              <h3 className="lane__t">
                <span aria-hidden="true">🛍️</span> {t('lp.forCustomers')}
              </h3>
              <ol className="steps">
                {[t('lp.c1'), t('lp.c2'), t('lp.c3'), t('lp.c4')].map((step, i) => (
                  <li key={step}>
                    <b>{i + 1}</b>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- */}
      {/* 4. Why                                                       */}
      {/* ---------------------------------------------------------- */}
      <section className="lsection">
        <div className="wrap">
          <div className="lsection__head">
            <h2>{t('lp.whyTitle')}</h2>
          </div>

          <div className="whys">
            {[
              ['🏡', t('lp.w1'), t('lp.w1b')],
              ['🔳', t('lp.w2'), t('lp.w2b')],
              ['🗣️', t('lp.w3'), t('lp.w3b')],
              ['🔒', t('lp.w4'), t('lp.w4b')],
            ].map(([icon, title, body]) => (
              <article className="why" key={title}>
                <div className="why__icon" aria-hidden="true">{icon}</div>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- */}
      {/* 5. Categories — tapping one goes straight to shopping        */}
      {/* ---------------------------------------------------------- */}
      <section className="lsection lsection--tint">
        <div className="wrap">
          <div className="lsection__head">
            <h2>{t('lp.catTitle')}</h2>
            <p>{t('lp.catLede')}</p>
          </div>

          <div className="cats">
            {[
              ['🌶️', 'मसाले', 'Masala'],
              ['🫙', 'लोणची', 'Pickles'],
              ['🥟', 'पापड', 'Papad'],
              ['🍬', 'मिठाई', 'Sweets'],
              ['🧺', 'हस्तकला', 'Handicrafts'],
              ['🧵', 'कापड', 'Textiles'],
              ['🕯️', 'अगरबत्ती', 'Agarbatti'],
              ['🍯', 'घरगुती पदार्थ', 'Homemade'],
            ].map(([icon, mr, en]) => (
              <button className="cat" key={en} onClick={goBuy}>
                <div className="cat__i" aria-hidden="true">{icon}</div>
                <div className="cat__t">{lang === 'mr' ? mr : en}</div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- */}
      {/* 6. Built for her                                             */}
      {/* ---------------------------------------------------------- */}
      <section className="lsection">
        <div className="wrap women">
          <figure className="hero__art" style={{ margin: 0 }}>
            <HeroArt />
          </figure>

          <div className="women__copy">
            <h2>{t('lp.womenTitle')}</h2>
            <p className="muted">{t('lp.womenLede')}</p>
            <ul className="women__list">
              {[t('lp.wl1'), t('lp.wl2'), t('lp.wl3'), t('lp.wl4')].map((line) => (
                <li key={line}>
                  <span aria-hidden="true">✓</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- */}
      {/* 7. Final call — the doors again                              */}
      {/* ---------------------------------------------------------- */}
      <section className="lsection">
        <div className="wrap">
          <div className="cta">
            <h2>{t('lp.finalTitle')}</h2>
            <p>{t('lp.finalLede')}</p>
            <div className="cta__btns">
              <button className="btn" onClick={goSell}>
                🧺 {t('lp.finalSell')}
              </button>
              <button className="btn btn--ghost" onClick={goBuy}>
                🛍️ {t('lp.finalBuy')}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- */}
      {/* 8. Footer                                                    */}
      {/* ---------------------------------------------------------- */}
      <footer className="lfoot">
        <div className="wrap lfoot__in">
          <div>
            <strong style={{ color: 'var(--maroon)' }}>शांता महिला बाजार</strong>
            {' — '}
            {t('lp.footer')}
          </div>
          <div>Shanta Mahila Bazar</div>
        </div>
      </footer>
    </div>
  )
}
