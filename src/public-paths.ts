/** Canonical public paths for the mobile web access flow (bot links, QR codes, search, OBS). */
export const SUPPORTED_PLATFORMS = ["twitch"] as const;
export type SupportedPlatform = (typeof SUPPORTED_PLATFORMS)[number];

/** Parse and validate a `/s/:platform/:login` style path segment pair. */
export function publicChannelPath(
  platform: string,
  login: string,
): { platform: SupportedPlatform; login: string; path: string } | undefined {
  const normalized = login.toLowerCase();
  if (
    !SUPPORTED_PLATFORMS.includes(platform.toLowerCase() as SupportedPlatform) ||
    !/^[a-z0-9_]{1,40}$/.test(normalized)
  )
    return undefined;
  return { platform: "twitch", login: normalized, path: `/s/twitch/${normalized}` };
}

/** Absolute public HTTPS URL for a streamer page; never encodes sessions. */
export function publicChannelUrl(origin: string, platform: string, login: string): string {
  const channel = publicChannelPath(platform, login);
  if (!channel) throw new Error("Canal o plataforma no soportada.");
  let base: URL;
  try {
    base = new URL(origin);
  } catch {
    throw new Error("Usá el origen HTTPS público de Plot.");
  }
  if (base.protocol !== "https:" || base.pathname !== "/" || base.search || base.hash)
    throw new Error("Usá el origen HTTPS público de Plot.");
  return `${base.origin}${channel.path}`;
}

export const joinPath = (platform: string, login: string) =>
  publicChannelPath(platform, login) && `/join/twitch/${login.toLowerCase()}`;
export const overlayPath = (platform: string, login: string) =>
  publicChannelPath(platform, login) && `/overlay/twitch/${login.toLowerCase()}`;
