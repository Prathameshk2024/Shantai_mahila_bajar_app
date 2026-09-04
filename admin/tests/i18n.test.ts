import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dictionaries, LANGS } from '../src/i18n/strings.js'

/**
 * The console is bilingual, which is only true if BOTH dictionaries are
 * complete. A missing Marathi string does not crash - `t()` falls back to
 * English - so without this test the failure is invisible until a Marathi
 * speaker opens the screen and finds one English word sitting in the middle
 * of it. That is exactly the bug that survives to production.
 */

test('every language in LANGS has a dictionary', () => {
  for (const { code } of LANGS) {
    assert.ok(dictionaries[code], `no dictionary for ${code}`)
  }
})

test('Marathi and English hold exactly the same keys', () => {
  const mr = Object.keys(dictionaries.mr).sort()
  const en = Object.keys(dictionaries.en).sort()

  const missingFromMr = en.filter((k) => !dictionaries.mr[k])
  const missingFromEn = mr.filter((k) => !dictionaries.en[k])

  assert.deepEqual(missingFromMr, [], 'keys with no Marathi translation')
  assert.deepEqual(missingFromEn, [], 'keys with no English translation')
})

test('no string is left empty in either language', () => {
  for (const [code, dict] of Object.entries(dictionaries)) {
    for (const [key, value] of Object.entries(dict)) {
      assert.ok(value.trim().length > 0, `${code}.${key} is empty`)
    }
  }
})

test('the Marathi dictionary is actually in Marathi', () => {
  // Guards against a copy-paste that leaves English text under the mr key.
  // Some entries are legitimately Latin (UTR, FSSAI), so this checks the bulk
  // rather than every line.
  const devanagari = /[ऀ-ॿ]/
  const values = Object.values(dictionaries.mr)
  const translated = values.filter((v) => devanagari.test(v)).length

  assert.ok(
    translated / values.length > 0.85,
    `only ${translated}/${values.length} Marathi strings contain Devanagari`,
  )
})

test('every seller status the API can return has a label', () => {
  // shared/src/types.ts SellerStatus - if a status is added there and not
  // here, the console would print the raw enum at a woman's account.
  for (const status of [
    'REGISTERED', 'PAYMENT_SUBMITTED', 'ACTIVE', 'PAYMENT_REJECTED', 'BLOCKED',
  ]) {
    assert.ok(dictionaries.mr[`st.${status}`], `no Marathi label for ${status}`)
    assert.ok(dictionaries.en[`st.${status}`], `no English label for ${status}`)
  }
})
