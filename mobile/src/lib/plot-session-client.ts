import { Buffer } from 'buffer';
export interface PlotMessageWallet { connect(): Promise<{ publicKey: { toBase58(): string } }>; signMessage(message: Uint8Array, expectedWallet: string): Promise<Uint8Array> }
export interface PlotSessionStore { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void>; deleteItem(key: string): Promise<void> }
type Fetch = (url: string, init: RequestInit) => Promise<{ok: boolean; json(): Promise<unknown>}>;
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
/** A challenge must belong to this exact origin and wallet before it reaches the signer. */
export function validatePlotChallenge(value: unknown, origin: string, wallet: string, now = Date.now()) {
  if (!obj(value) || typeof value.challengeId !== 'string' || !/^[a-f0-9]{64}$/.test(value.challengeId) || typeof value.message !== 'string' || typeof value.expiresAt !== 'string') throw new Error('Desafío de sesión inválido.');
  const expires = Date.parse(value.expiresAt), url = new URL(origin);
  const lines=value.message.split('\n');
  if (url.origin !== origin || lines.length !== 10 || lines[0] !== `${url.host} wants you to sign in with your Solana account:` || lines[1] !== wallet || lines[2] !== '' || lines[3] !== 'Iniciar sesion en Prediction Mirror.' || lines[4] !== '' || lines[5] !== `URI: ${origin}` || lines[6] !== 'Version: 1' || !/^Nonce: [a-f0-9]{24}$/.test(lines[7]) || !lines[8].startsWith('Issued At: ') || lines[9] !== `Expiration Time: ${value.expiresAt}` || !Number.isFinite(expires) || expires <= now || expires > now + 6 * 60_000 || !Number.isFinite(Date.parse(lines[8].slice(11)))) throw new Error('El desafío no corresponde a esta wallet o servidor.');
  return { challengeId:value.challengeId, message:value.message };
}
export class PlotSessionClient {
  constructor(private readonly base: string, private readonly wallet: PlotMessageWallet, private readonly store: PlotSessionStore, private readonly request: Fetch = fetch) {}
  private key(wallet: string) { return `plot.session.v1.${Buffer.from(this.base, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}.${wallet}`; }
  private async post(path: string, body: unknown) { const r=await this.request(`${this.base}${path}`,{method:'POST',headers:{'content-type':'application/json',accept:'application/json'},body:JSON.stringify(body)}); if (!r.ok) throw new Error('No se pudo iniciar sesión en Plot.'); return r.json(); }
  async login() {
    const wallet=(await this.wallet.connect()).publicKey.toBase58();
    const challenge=validatePlotChallenge(await this.post('/api/auth/challenge',{address:wallet}),this.base,wallet);
    const signature=await this.wallet.signMessage(Buffer.from(challenge.message,'utf8'),wallet);
    if (signature.length !== 64) throw new Error('Firma de sesión inválida.');
    const result=await this.post('/api/auth/verify',{challengeId:challenge.challengeId,signature:Buffer.from(signature).toString('base64')});
    if (!obj(result) || typeof result.token !== 'string' || !/^[a-f0-9]{64}$/.test(result.token) || !obj(result.account) || result.account.wallet !== wallet) throw new Error('La sesión recibida no corresponde a la wallet.');
    await this.store.setItem(this.key(wallet), result.token);
    return { wallet };
  }
  async token(wallet: string) { const token=await this.store.getItem(this.key(wallet)); if (!token) throw new Error('Iniciá sesión en Plot.'); return token; }
  async logout(wallet: string) { await this.store.deleteItem(this.key(wallet)); }
}
