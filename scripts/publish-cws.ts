import { execFileSync } from 'node:child_process';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const archive = 'dist/web/downloads/plot-extension.zip';
const manifestPath = 'dist/extension/manifest.json';
const scope = 'https://chromewebstore.googleapis.com';
type Revision = { distributionChannels?: { crxVersion?: string }[] };
type Status = { publishedItemRevisionStatus?: Revision; submittedItemRevisionStatus?: Revision };

function versionParts(version: string): number[] {
  if (!/^(0|[1-9]\d*)(\.(0|[1-9]\d*)){0,3}$/.test(version)) throw new Error('Invalid Chrome extension version');
  const parts = version.split('.').map(Number);
  if (parts.some(part => part > 65535)) throw new Error('Chrome extension version component exceeds 65535');
  return [...parts, ...Array<number>(4 - parts.length).fill(0)];
}

export function nextVersion(versions: string[]): string {
  const sorted = versions.map(versionParts).sort((a, b) => {
    for (let i = 0; i < 4; i++) if (a[i] !== b[i]) return b[i] - a[i];
    return 0;
  });
  const highest = sorted[0];
  if (!highest) throw new Error('No version available');
  if (highest[2] === 65535) throw new Error('Patch version exhausted; update the source base version');
  highest[2]++;
  return highest.slice(0, 3).join('.');
}

export function versionFromStatus(base: string, status: Status): string {
  const versions = [base];
  for (const revision of [status.publishedItemRevisionStatus, status.submittedItemRevisionStatus]) {
    if (!revision) continue;
    if (!revision.distributionChannels?.length) throw new Error('Store revision has no version information');
    for (const channel of revision.distributionChannels) {
      if (!channel.crxVersion) throw new Error('Store channel has no version information');
      versions.push(channel.crxVersion);
    }
  }
  if (!status.publishedItemRevisionStatus) throw new Error('Store item has no published version');
  return nextVersion(versions);
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

async function requestJson(url: string, options: RequestInit, operation: string): Promise<Record<string, unknown>> {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${operation} failed (HTTP ${response.status})`);
  const data: unknown = await response.json();
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(`${operation} returned an invalid response`);
  return data as Record<string, unknown>;
}

async function context() {
  const params = new URLSearchParams({ client_id: required('CWS_CLIENT_ID'), client_secret: required('CWS_CLIENT_SECRET'), refresh_token: required('CWS_REFRESH_TOKEN'), grant_type: 'refresh_token' });
  const publisher = required('CWS_PUBLISHER_ID');
  const item = required('CWS_EXTENSION_ID');
  if (!/^[A-Za-z0-9_-]+$/.test(publisher) || !/^[a-p]{32}$/.test(item)) throw new Error('Invalid CWS publisher or extension ID');
  const token = await requestJson('https://oauth2.googleapis.com/token', { method: 'POST', body: params }, 'Token exchange');
  if (typeof token.access_token !== 'string' || !token.access_token) throw new Error('Token exchange returned no access token');
  return { name: `publishers/${publisher}/items/${item}`, headers: { Authorization: `Bearer ${token.access_token}` } };
}

export function verifyManifest(manifest: Record<string, unknown>): void {
  if ('key' in manifest || /localhost|127\.0\.0\.1/i.test(JSON.stringify(manifest))) throw new Error('Store manifest contains a key or local host');
}

async function prepare() {
  const source = JSON.parse(await readFile('extension/manifest.json', 'utf8')) as { version: string };
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, unknown>;
  verifyManifest(manifest);
  const { name, headers } = await context();
  const status = await requestJson(`${scope}/v2/${name}:fetchStatus`, { headers }, 'Fetch store status');
  manifest.version = versionFromStatus(source.version, status as Status);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  // A fresh archive avoids retaining deleted files from a previous build.
  await rm(archive, { force: true });
  execFileSync('zip', ['-qr', '../web/downloads/plot-extension.zip', '.'], { cwd: 'dist/extension' });
  console.log(`Prepared store version ${manifest.version}`);
}

async function publish() {
  const { name, headers } = await context();
  const body = await readFile(archive);
  const upload = await requestJson(`${scope}/upload/v2/${name}:upload`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/zip' }, body }, 'Upload');
  if (upload.uploadState !== 'SUCCEEDED') throw new Error(`Upload did not succeed (state: ${typeof upload.uploadState === 'string' && /^[A-Z_]+$/.test(upload.uploadState) ? upload.uploadState : 'unknown'})`);
  const result = await requestJson(`${scope}/v2/${name}:publish`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: '{}' }, 'Publish');
  console.log(`Submitted to Chrome Web Store (state: ${typeof result.state === 'string' && /^[A-Z_]+$/.test(result.state) ? result.state : 'unknown'})`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv[2] === 'prepare') await prepare();
    else if (!process.argv[2]) await publish();
    else throw new Error('Usage: publish-cws.ts [prepare]');
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Chrome Web Store operation failed');
    process.exitCode = 1;
  }
}
