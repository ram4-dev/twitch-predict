/**
 * Chat formatting for Plot's bot replies.
 *
 * Twitch constraints this module exists for:
 *  - a message is capped at 500 characters;
 *  - chat has no line breaks, so a wall of text separated by " | " is unreadable;
 *  - a bot may send at most ~20 messages per 30 s, so splitting is cheap but not free.
 *
 * Strategy: one market per message, numbered options inline, and the channel link only once at the end.
 * Anything that would still overflow is truncated with an explicit marker instead of being silently cut.
 */

export const CHAT_MESSAGE_MAX = 500;
/** Room kept for the trailing channel link so it is never truncated away. */
export const CHAT_LINK_RESERVE = 60;

const PHASE_LABEL: Record<string, string> = {
  open: 'abierta',
  locked: 'esperando resultado',
  resolved: 'resuelta',
  void: 'reembolsada',
};

export type ChatReply = { text: string };

const truncate = (value: string, max: number) =>
  value.length <= max ? value : `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…`;

/** "1 Sí · 2 No" — compact, and the numbers are exactly what !plot resolver/cerrar accept. */
export function formatOptions(outcomes: string[]): string {
  return outcomes.map((title, index) => `${index + 1} ${title}`).join(' · ');
}

/**
 * Parses the pipe-joined market list produced by the points layer:
 * `FY · esperando resultado · Title · !1 a · !2 b | NL · ...`
 * Returns [] when the text is not a market list, so callers can fall back to a plain reply.
 */
export function parseMarketList(text: string): { code: string; phase: string; title: string; options: string }[] {
  const rows = text.split(' | ').map((row) => row.trim()).filter(Boolean);
  const parsed = rows.map((row) => {
    const parts = row.split(' · ').map((part) => part.trim());
    if (parts.length < 3) return undefined;
    const [code, phase, ...rest] = parts;
    // The title is everything until the first option token (!1 …), which keeps commas and dots safe.
    const optionStart = rest.findIndex((part) => /^!\d\s/.test(part));
    const titleParts = optionStart < 0 ? rest : rest.slice(0, optionStart);
    const optionParts = optionStart < 0 ? [] : rest.slice(optionStart);
    const title = titleParts.join(' · ').trim();
    if (!code || !title) return undefined;
    return {
      code,
      phase: PHASE_LABEL[phase] ?? phase,
      title,
      options: optionParts.map((part) => part.replace(/^!(\d)\s+/, '$1 ')).join(' · '),
    };
  });
  return parsed.filter((row): row is NonNullable<typeof row> => !!row);
}

/** One line per market: `#FY · esperando resultado · ¿Cuántas kills? · 1 más de 8 · 2 menos de 8` */
export function formatMarketLine(market: { code: string; phase: string; title: string; options: string }): string {
  const head = `#${market.code} · ${market.phase}`;
  const body = market.options ? `${truncate(market.title, 180)} · ${market.options}` : truncate(market.title, 200);
  return truncate(`${head} · ${body}`, CHAT_MESSAGE_MAX - 4);
}

/**
 * Turns one bot reply into the messages that should be sent, in order.
 * A single-market reply stays one message; a list becomes one message per market with the link last.
 */
export function splitChatReply(reply: string, channelUrl: string): ChatReply[] {
  const link = channelUrl ? ` ${channelUrl}` : '';
  const markets = parseMarketList(reply);
  if (!markets.length) {
    // Plain reply: one message, trimmed to leave room for the link.
    return [{ text: `${truncate(reply, CHAT_MESSAGE_MAX - link.length)}${link}` }];
  }
  if (markets.length === 1) {
    return [{ text: `${formatMarketLine(markets[0])}${link}` }];
  }
  const messages: ChatReply[] = markets.map((market) => ({ text: formatMarketLine(market) }));
  // The link goes on the last message only: repeating it per market is what made the old output noisy.
  const last = messages[messages.length - 1];
  last.text = `${truncate(last.text, CHAT_MESSAGE_MAX - link.length)}${link}`;
  return messages;
}
