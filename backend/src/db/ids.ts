/**
 * Id generation, in a leaf module on purpose.
 *
 * `seed.ts` derives customers through `customers.ts`, and `customers.ts` needs
 * to mint address ids. Taking that from `store.ts` would close the loop
 * seed -> customers -> store -> seed, and store builds its initial database by
 * calling `seed()` at module load, so the cycle would bite at boot rather than
 * at build time. Keeping ids here leaves nothing to import back.
 */

/** Short, sortable-ish id. Firestore document ids are set from these. */
export function newId(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`
}
