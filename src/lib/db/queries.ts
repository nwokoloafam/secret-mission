// Read-only queries the pages use to build what each person sees.
import { randomBytes } from "node:crypto";
import { db } from "./client";
import { rowToGame } from "./games";
import { Game } from "../game/types";

export type Row = Record<string, unknown>;

export function newToken(bytes = 6): string {
  return randomBytes(bytes).toString("base64url");
}

export interface PlayerRow {
  id: string;
  game_id: string;
  token: string;
  first_name: string;
  photo_url: string | null;
  how_know_afam: string | null;
  top_color: string | null;
  accessory: string | null;
  custom_hint: string | null;
  status: string;
  code: string | null;
  target_id: string | null;
  mission_id: string | null;
  rerolls_left: number;
  accusations_used: number;
  bonus_accusation_earned: boolean;
  kill_count: number;
  last_kill_at: Date | null;
  grace_until: Date | null;
  shield_until: Date | null;
  out_reason: string | null;
  out_by: string | null;
  out_at: Date | null;
  bet_on_id: string | null;
  poltergeist_used: boolean;
  sms_opt_in: boolean;
  email: string | null;
  email_opt_in: boolean;
  email_consent_at: Date | null;
  created_at: Date;
}

/** The game people sign up for: the newest one that hasn't ended. */
export async function currentGame(): Promise<Game | null> {
  const rows = await db()`select * from games where status <> 'ended' order by created_at desc limit 1`;
  return rows[0] ? rowToGame(rows[0]) : null;
}

export async function playerByToken(token: string): Promise<PlayerRow | null> {
  const rows = await db()<PlayerRow[]>`select * from players where token = ${token}`;
  return rows[0] ?? null;
}

export async function gameByAdminToken(token: string): Promise<Game | null> {
  const rows = await db()`select * from games where admin_token = ${token}`;
  return rows[0] ? rowToGame(rows[0]) : null;
}

export async function gameById(id: string): Promise<Game | null> {
  const rows = await db()`select * from games where id = ${id}`;
  return rows[0] ? rowToGame(rows[0]) : null;
}

export async function playersOf(gameId: string): Promise<PlayerRow[]> {
  return db()<PlayerRow[]>`select * from players where game_id = ${gameId} order by created_at`;
}

export interface MissionRow {
  id: string;
  text: string;
  difficulty: "E" | "M" | "H";
  category: string | null;
  active: boolean;
}

export async function allMissions(): Promise<MissionRow[]> {
  return db()<MissionRow[]>`select id, text, difficulty, category, active from missions order by active desc, difficulty, text`;
}

export async function missionText(id: string | null): Promise<string | null> {
  if (!id) return null;
  const rows = await db()`select text from missions where id = ${id}`;
  return (rows[0]?.text as string) ?? null;
}

export interface HintRow {
  id: string;
  to_player_id: string;
  about_player_id: string | null;
  source: string;
  text: string;
  created_at: Date;
}

export async function hintsTo(playerId: string): Promise<HintRow[]> {
  return db()<HintRow[]>`select * from hints where to_player_id = ${playerId} order by created_at desc`;
}

export interface EventRow {
  id: string;
  type: string;
  actor_id: string | null;
  subject_id: string | null;
  data: Record<string, unknown>;
  created_at: Date;
}

export async function eventsOf(gameId: string, limit = 500): Promise<EventRow[]> {
  return db()<EventRow[]>`select * from events where game_id = ${gameId} order by id desc limit ${limit}`;
}

export async function latestBroadcast(gameId: string): Promise<EventRow | null> {
  const rows = await db()<EventRow[]>`
    select * from events where game_id = ${gameId} and type = 'broadcast'
      and created_at > now() - interval '20 minutes'
    order by id desc limit 1`;
  return rows[0] ?? null;
}

export interface DisputeRow {
  id: string;
  raised_by: string;
  against: string;
  note: string | null;
  status: string;
  created_at: Date;
}

export async function openDisputes(gameId: string): Promise<DisputeRow[]> {
  return db()<DisputeRow[]>`select * from disputes where game_id = ${gameId} and status = 'open' order by created_at`;
}

/** Current time, for server components rendering per request (after connection()). */
export function serverNow(): number {
  return Date.now();
}
