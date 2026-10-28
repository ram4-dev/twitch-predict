/** Accept only Twitch logins or canonical Twitch channel links, never arbitrary URLs. */
export function twitchChannel(input: string): string {
  let channel = input.trim();
  if (/^https?:\/\//i.test(channel)) {
    const url = new URL(channel);
    if (
      !["twitch.tv", "www.twitch.tv", "m.twitch.tv"].includes(url.hostname) ||
      url.username ||
      url.password ||
      url.port
    )
      throw new Error("Pegá el enlace de un canal de Twitch.");
    channel = url.pathname.replace(/^\//, "").replace(/\/$/, "");
  }
  channel = channel.replace(/^@/, "").toLowerCase();
  if (
    !/^[a-z0-9_]{1,40}$/.test(channel) ||
    ["videos", "directory", "downloads", "settings", "subscriptions"].includes(
      channel,
    )
  )
    throw new Error("Ingresá el nombre del streamer o su enlace de Twitch.");
  return channel;
}
export function mobileApiOrigin(input: string, development = false): string {
  const url = new URL(input.trim());
  const local =
    ["127.0.0.1", "localhost", "10.0.2.2", "[::1]"].includes(url.hostname) ||
    url.hostname.endsWith(".localhost");
  if (
    (url.protocol !== "https:" &&
      !(development && local && url.protocol === "http:")) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw new Error("Usá la dirección HTTPS del servidor de Plot.");
  return url.origin;
}
