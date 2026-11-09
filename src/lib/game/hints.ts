// Picks the next hint about a player, escalating each time:
//   group → outfit → custom (Afam's) → initial
// A tier is skipped when its info is missing, or when it would match more
// than half of the players still alive (too vague to help).
// Rules reference: background-info/rules/accusation-options.md

import { GameState, HintSource, Player } from "./types";

export const HINT_TIERS: HintSource[] = ["group", "outfit", "custom", "initial"];

export interface PickedHint {
  source: HintSource;
  text: string;
  /** Value to store in hint_tier_revealed so the next hint escalates. */
  nextTier: number;
}

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

function outfitKey(p: Player): string {
  return `${norm(p.topColor)}|${norm(p.accessory)}`;
}

function outfitText(p: Player): string | null {
  const color = p.topColor?.trim();
  const acc = p.accessory?.trim();
  const hasAcc = acc && norm(acc) !== "none";
  if (!color && !hasAcc) return null;
  if (color && hasAcc) return `Your target is wearing ${color.toLowerCase()} and has ${acc!.toLowerCase()}.`;
  if (color) return `Your target is wearing ${color.toLowerCase()}.`;
  return `Your target has ${acc!.toLowerCase()}.`;
}

function tooCommon(alive: Player[], matches: (p: Player) => boolean): boolean {
  if (alive.length <= 2) return false;
  return alive.filter(matches).length > alive.length / 2;
}

export function nextHintFor(state: GameState, aboutId: string): PickedHint | null {
  const about = state.players.find((p) => p.id === aboutId);
  if (!about) return null;
  const alive = state.players.filter((p) => p.status === "alive");

  for (let tier = about.hintTierRevealed; tier < HINT_TIERS.length; tier++) {
    const source = HINT_TIERS[tier];
    let text: string | null = null;

    if (source === "group" && about.howKnowAfam?.trim()) {
      const g = norm(about.howKnowAfam);
      if (!tooCommon(alive, (p) => norm(p.howKnowAfam) === g)) {
        text = `How your target knows Afam: ${about.howKnowAfam.trim()}.`;
      }
    } else if (source === "outfit") {
      const t = outfitText(about);
      const key = outfitKey(about);
      if (t && !tooCommon(alive, (p) => outfitKey(p) === key)) text = t;
    } else if (source === "custom" && about.customHint?.trim()) {
      text = about.customHint.trim();
    } else if (source === "initial" && about.firstName.trim()) {
      text = `Your target's name starts with ${about.firstName.trim()[0].toUpperCase()}.`;
    }

    if (text) return { source, text, nextTier: tier + 1 };
  }
  return null;
}
