import { canonicalAppUrl } from "./config";

const copy = {
  personal_link: ["Your Secret Mission page", "Here is your private Secret Mission page."],
  new_target: ["Secret Mission update", "Your game has an update. Open your private page to see it."],
  announcement: ["Announcement from Afam", "Afam posted an announcement. Open your inbox to read it."],
  game_started: ["Secret Mission has started", "The game has started. Open your private page to play."],
  paused: ["Secret Mission paused", "The game is paused. Check your private page for updates."],
  resumed: ["Secret Mission resumed", "The game has resumed. Open your private page to play."],
  game_over: ["Secret Mission has ended", "The game is over. Check your private page for the result."],
  eliminated: ["Secret Mission update", "Your game status has changed. Open your private page to see it."],
  hint: ["Secret Mission update", "There is a new update on your private page."],
  end_time_changed: ["Secret Mission timing update", "The game timing has changed. Check your private page for details."],
} as const;
export type EmailKind = keyof typeof copy;
export type EmailMessage = { subject: string; textContent: string };

// Deliberately accepts no announcement text, names, targets or mission details.
export function buildEmail(kind: string, token: string, appUrl: string): EmailMessage {
  if (!Object.hasOwn(copy, kind)) throw new Error("unsupported_email_kind");
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(token)) throw new Error("invalid_player_token");
  const [subject, text] = copy[kind as EmailKind];
  const url = `${canonicalAppUrl(appUrl, true)}/p/${token}`;
  return { subject, textContent: `${text}\n\n${url}\n\nKeep this link private. Turn off emails on your personal page.\n\nSecret Mission` };
}
