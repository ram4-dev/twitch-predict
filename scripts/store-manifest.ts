type Manifest = {
  key?: string;
  host_permissions?: string[];
  externally_connectable?: { matches?: string[] };
  [key: string]: unknown;
};

// Unpacked dev builds pin an extension id with `key` and call local bridges.
// Chrome Web Store rejects `key` and treats localhost / 127.0.0.1 as review risk.
export function isDevHostPattern(pattern: string): boolean {
  const scheme = pattern.indexOf('://');
  if (scheme < 0) return false;
  const host = pattern.slice(scheme + 3).split('/')[0].replace(/:\d+$/, '');
  const name = host.replace(/^\*\./, '');
  return host === '*' || name === 'localhost' || name.endsWith('.localhost') || name === '127.0.0.1' || name === '0.0.0.0' || name === '[::1]';
}

export function toStoreManifest(manifest: Manifest, publicOrigin?: string): Manifest {
  const next: Manifest = structuredClone(manifest);
  delete next.key;
  const keep = (pattern: string) => !isDevHostPattern(pattern);
  if (next.host_permissions) next.host_permissions = next.host_permissions.filter(keep);
  if (next.externally_connectable?.matches) {
    next.externally_connectable.matches = next.externally_connectable.matches.filter(keep);
    if (!next.externally_connectable.matches.length) delete next.externally_connectable;
  }
  if (publicOrigin) {
    const pattern = `${publicOrigin.replace(/\/$/, '')}/*`;
    if (isDevHostPattern(pattern)) throw new Error('PLOT_PUBLIC_ORIGIN cannot be a local host');
    next.host_permissions ??= [];
    if (!next.host_permissions.includes(pattern)) next.host_permissions.push(pattern);
    next.externally_connectable ??= { matches: [] };
    if (!next.externally_connectable.matches!.includes(pattern)) next.externally_connectable.matches!.push(pattern);
  }
  return next;
}
