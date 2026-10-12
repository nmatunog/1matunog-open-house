/** SDK v9+: DocumentSnapshot.exists is a method, not a property. */
export function snapExists(snap: { exists: (() => boolean) | boolean }): boolean {
  return typeof snap.exists === 'function' ? snap.exists() : snap.exists === true;
}
