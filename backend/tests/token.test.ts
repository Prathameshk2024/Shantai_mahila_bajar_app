import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'

// config.ts reads the environment once at module load, so this must be set
// before the module under test is imported.
process.env.SESSION_SECRET = 'test-secret-for-unit-tests'

const { signToken, verifyToken } = await import('../src/middleware/auth.js')

const CUSTOMER = {
  role: 'customer' as const,
  userId: 'c-9011223344',
  phone: '9011223344',
  customerId: 'c-9011223344',
}

test('rejects a hand-forged token that carries no signature', () => {
  // Exactly what an attacker would craft: the old unsigned format.
  const forged = Buffer.from(JSON.stringify(CUSTOMER), 'utf8').toString('base64url')

  assert.equal(verifyToken(forged), null)
})

test('a valid token round-trips back to the same context', () => {
  assert.deepEqual(verifyToken(signToken(CUSTOMER)), CUSTOMER)
})

test('rejects a token whose payload was swapped for another customer', () => {
  // The attack the signature exists to stop: keep a real signature, point the
  // payload at somebody else's customer id.
  const mine = signToken(CUSTOMER)
  const signature = mine.slice(mine.indexOf('.') + 1)
  const hers = Buffer.from(
    JSON.stringify({ ...CUSTOMER, userId: 'c-9922334455', customerId: 'c-9922334455' }),
    'utf8',
  ).toString('base64url')

  assert.equal(verifyToken(`${hers}.${signature}`), null)
})

test('rejects a token whose signature was altered', () => {
  const token = signToken(CUSTOMER)
  const flipped = token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A')

  assert.equal(verifyToken(flipped), null)
})

test('rejects a signature of the right shape but the wrong key', () => {
  const payload = Buffer.from(JSON.stringify(CUSTOMER), 'utf8').toString('base64url')
  const wrong = createHmac('sha256', 'not-the-real-secret').update(payload).digest('base64url')

  assert.equal(verifyToken(`${payload}.${wrong}`), null)
})

test('rejects empty and malformed tokens without throwing', () => {
  for (const bad of ['', '.', 'a.', '.b', 'no-dot-at-all', 'not base64!.also not']) {
    assert.equal(verifyToken(bad), null, `expected null for ${JSON.stringify(bad)}`)
  }
})
