"use server";

// Every button on the site calls one of these. Player actions are authorised
// by the player's secret link token; host actions by the game's admin token.

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import * as E from "@/lib/game/engine";
import { ActionResult, Ctx, GameError, GameState } from "@/lib/game/types";
import { db } from "@/lib/db/client";
import { runAction, runTick } from "@/lib/db/games";
import { currentGame, gameByAdminToken, newToken, playerByToken } from "@/lib/db/queries";
import { uploadPhoto } from "@/lib/photos";

export type Result = { ok: true; message?: string; data?: Record<string, unknown> } | { ok: false; error: string };

const fail = (error: string): Result => ({ ok: false, error });

async function wrap(fn: () => Promise<Result | void>): Promise<Result> {
  try {
    const r = (await fn()) ?? { ok: true as const };
    refresh();
    return r;
  } catch (e) {
    if (e instanceof GameError) return fail(e.message);
    if (e && typeof e === "object" && "digest" in e) throw e; // redirect()
    console.error(e);
    return fail(e instanceof Error ? e.message : "Something went wrong.");
  }
}

const clean = (v: FormDataEntryValue | null, max = 80) => (typeof v === "string" ? v.trim().slice(0, max) : "");

async function asPlayer(token: string) {
  const p = await playerByToken(token);
  if (!p) throw new GameError("no_player", "This link isn't valid.");
  return p;
}

async function play(token: string, action: (s: GameState, c: Ctx, playerId: string) => ActionResult) {
  const p = await asPlayer(token);
  return runAction(p.game_id, (s, c) => action(s, c, p.id));
}

async function asHost(adminToken: string) {
  const g = await gameByAdminToken(adminToken);
  if (!g) throw new GameError("no_admin", "This admin link isn't valid.");
  return g;
}

async function host(adminToken: string, action: (s: GameState, c: Ctx) => ActionResult) {
  const g = await asHost(adminToken);
  return runAction(g.id, action);
}

async function logEvent(gameId: string, type: string, actorId: string | null, subjectId: string | null, data: object = {}) {
  await db()`insert into events (game_id, type, actor_id, subject_id, data)
             values (${gameId}, ${type}, ${actorId}, ${subjectId}, ${db().json(JSON.parse(JSON.stringify(data)))})`;
}

// ─────────────────────────────────────────────
// Sign-up
// ─────────────────────────────────────────────

export async function signUp(_: Result | null, form: FormData): Promise<Result> {
  const firstName = clean(form.get("firstName"), 30);
  const how = clean(form.get("how"), 40);
  const phone = clean(form.get("phone"), 20);
  const sms = form.get("sms") === "on" && phone.length > 0;
  if (!firstName) return fail("Add your first name.");
  if (!how) return fail("Tell us how you know Afam.");

  const game = await currentGame();
  if (!game) return fail("Sign-ups aren't open yet.");

  let photoUrl: string | null = null;
  const photo = form.get("photo");
  if (photo instanceof File && photo.size > 0) {
    try {
      photoUrl = await uploadPhoto(photo);
    } catch (e) {
      return fail(e instanceof Error ? e.message : "Photo upload failed.");
    }
  }

  const token = newToken();
  await db()`
    insert into players (game_id, token, first_name, photo_url, how_know_afam, phone, sms_opt_in)
    values (${game.id}, ${token}, ${firstName}, ${photoUrl}, ${how}, ${sms ? phone : null}, ${sms})`;
  (await cookies()).set("sm_token", token, { maxAge: 60 * 60 * 24 * 60, httpOnly: true, sameSite: "lax", path: "/" });
  redirect(`/p/${token}`);
}

export async function updatePhoto(token: string, form: FormData): Promise<Result> {
  return wrap(async () => {
    const p = await asPlayer(token);
    const photo = form.get("photo");
    if (!(photo instanceof File) || photo.size === 0) return fail("Choose a photo first.");
    const url = await uploadPhoto(photo);
    await db()`update players set photo_url = ${url} where id = ${p.id}`;
    return { ok: true, message: "Photo updated." };
  });
}

// ─────────────────────────────────────────────
// Player actions
// ─────────────────────────────────────────────

export async function checkInAction(token: string, topColor: string, accessory: string): Promise<Result> {
  return wrap(async () => {
    const p = await asPlayer(token);
    await db()`update players set top_color = ${topColor.slice(0, 20) || null}, accessory = ${accessory.slice(0, 20) || null} where id = ${p.id}`;
    await runAction(p.game_id, (s, c) => E.checkIn(s, c, p.id));
  });
}

export async function updateOutfit(token: string, topColor: string, accessory: string): Promise<Result> {
  return wrap(async () => {
    const p = await asPlayer(token);
    await db()`update players set top_color = ${topColor.slice(0, 20) || null}, accessory = ${accessory.slice(0, 20) || null} where id = ${p.id}`;
    return { ok: true, message: "Outfit saved." };
  });
}

export async function submitKillAction(token: string, code: string): Promise<Result> {
  return wrap(async () => {
    const r = await play(token, (s, c, id) => E.submitKill(s, c, id, code));
    const kill = r.events.find((e) => e.type === "kill");
    return { ok: true, message: "Got them.", data: { victimId: kill?.subjectId ?? null } };
  });
}

export async function addKillStoryAction(token: string, victimId: string, story: string): Promise<Result> {
  return wrap(async () => {
    if (!story.trim()) return { ok: true };
    await play(token, (s, c, id) => E.addKillStory(s, c, id, victimId, story));
    return { ok: true, message: "Story saved for the reveal." };
  });
}

export async function accuseAction(token: string, suspectId: string): Promise<Result> {
  return wrap(async () => {
    const r = await play(token, (s, c, id) => E.accuse(s, c, id, suspectId));
    const right = r.events.some((e) => e.type === "accuse_right");
    return right
      ? { ok: true, message: "You caught your hunter! They're out, and you're shielded for 10 minutes." }
      : { ok: true, message: "Wrong guess. Your hunter just got a clue about you…" };
  });
}

export async function rerollAction(token: string): Promise<Result> {
  return wrap(async () => {
    await play(token, (s, c, id) => E.reroll(s, c, id));
    return { ok: true, message: "New task assigned." };
  });
}

export async function leaveAction(token: string): Promise<Result> {
  return wrap(async () => {
    await play(token, (s, c, id) => E.removePlayer(s, c, id, "left"));
    return { ok: true, message: "Thanks for playing! Afam has been told." };
  });
}

export async function cantFindAction(token: string): Promise<Result> {
  return wrap(async () => {
    const p = await asPlayer(token);
    if (p.status !== "alive") return fail("You're not in the game.");
    await logEvent(p.game_id, "cant_find", p.id, p.target_id);
    return { ok: true, message: "Afam has been pinged." };
  });
}

export async function disputeAction(token: string, note: string): Promise<Result> {
  return wrap(async () => {
    const p = await asPlayer(token);
    if (p.status !== "alive" || !p.target_id) return fail("You're not in the game.");
    await db()`insert into disputes (game_id, raised_by, against, note)
               values (${p.game_id}, ${p.id}, ${p.target_id}, ${note.trim().slice(0, 200) || null})`;
    await logEvent(p.game_id, "dispute", p.id, p.target_id, { note: note.trim().slice(0, 200) });
    return { ok: true, message: "Afam will sort it out." };
  });
}

export async function betAction(token: string, onId: string): Promise<Result> {
  return wrap(async () => {
    await play(token, (s, c, id) => E.placeBet(s, c, id, onId));
    return { ok: true, message: "Bet placed." };
  });
}

export async function poltergeistAction(token: string, toId: string, text: string): Promise<Result> {
  return wrap(async () => {
    await play(token, (s, c, id) => E.poltergeist(s, c, id, toId, text));
    return { ok: true, message: "Sent anonymously. Spooky." };
  });
}

/** Called by open player pages every so often so timers fire even if Afam's page is closed. */
export async function tickAction(gameId: string): Promise<void> {
  try {
    const r = await runTick(gameId);
    if (r) refresh();
  } catch (e) {
    console.error(e);
  }
}

// ─────────────────────────────────────────────
// Host (Afam) actions
// ─────────────────────────────────────────────

export async function hostStart(admin: string, durationMinutes: number): Promise<Result> {
  return wrap(async () => {
    const mins = Math.max(15, Math.min(600, Math.round(durationMinutes) || 150));
    await host(admin, (s, c) => E.startGame(s, c, { durationMinutes: mins }));
    return { ok: true, message: "Game started." };
  });
}

export async function hostPause(admin: string): Promise<Result> {
  return wrap(async () => void (await host(admin, E.pauseGame)));
}

export async function hostResume(admin: string): Promise<Result> {
  return wrap(async () => void (await host(admin, E.resumeGame)));
}

export async function hostEnd(admin: string): Promise<Result> {
  return wrap(async () => void (await host(admin, E.endGame)));
}

export async function hostShiftEnd(admin: string, minutes: number): Promise<Result> {
  return wrap(async () => {
    const g = await asHost(admin);
    if (!g.targetEndAt) return fail("The game hasn't started.");
    const next = new Date(g.targetEndAt.getTime() + minutes * 60_000);
    await runAction(g.id, (s, c) => E.setEndTime(s, c, next));
  });
}

export async function hostAddWalkIn(admin: string, firstName: string, how: string): Promise<Result> {
  return wrap(async () => {
    const g = await asHost(admin);
    const name = firstName.trim().slice(0, 30);
    if (!name) return fail("Add a name.");
    const token = newToken();
    const [row] = await db()`
      insert into players (game_id, token, first_name, how_know_afam)
      values (${g.id}, ${token}, ${name}, ${how.trim().slice(0, 40) || null}) returning id`;
    await runAction(g.id, (s, c) => E.checkIn(s, c, row.id as string));
    return { ok: true, message: `${name} added.`, data: { token } };
  });
}

export async function hostCheckIn(admin: string, playerId: string): Promise<Result> {
  return wrap(async () => void (await host(admin, (s, c) => E.checkIn(s, c, playerId))));
}

export async function hostRemove(admin: string, playerId: string): Promise<Result> {
  return wrap(async () => void (await host(admin, (s, c) => E.removePlayer(s, c, playerId, "removed"))));
}

export async function hostMove(admin: string, playerId: string, awayFromId: string | null): Promise<Result> {
  return wrap(async () => {
    await host(admin, (s, c) => E.movePlayer(s, c, playerId, awayFromId ?? undefined));
    return { ok: true, message: "Moved." };
  });
}

export async function hostSkip(admin: string, playerId: string): Promise<Result> {
  return wrap(async () => {
    await host(admin, (s, c) => E.skipMission(s, c, playerId));
    return { ok: true, message: "New task sent." };
  });
}

export async function hostSetCustomHint(admin: string, playerId: string, hint: string): Promise<Result> {
  return wrap(async () => {
    const g = await asHost(admin);
    await db()`update players set custom_hint = ${hint.trim().slice(0, 140) || null}
               where id = ${playerId} and game_id = ${g.id}`;
    return { ok: true, message: "Hint saved." };
  });
}

export async function hostSendHint(admin: string, aboutId: string, text: string): Promise<Result> {
  return wrap(async () => {
    await host(admin, (s, c) => E.sendHostHint(s, c, aboutId, text.trim() || undefined));
    return { ok: true, message: "Hint sent to their hunter." };
  });
}

export async function hostBroadcast(admin: string, text: string): Promise<Result> {
  return wrap(async () => {
    const g = await asHost(admin);
    const t = text.trim().slice(0, 200);
    if (!t) return fail("Write a message.");
    await logEvent(g.id, "broadcast", null, null, { text: t });
    return { ok: true, message: "Sent to everyone." };
  });
}

export async function hostResolveDispute(admin: string, disputeId: string, upheld: boolean): Promise<Result> {
  return wrap(async () => {
    const g = await asHost(admin);
    const [d] = await db()`select * from disputes where id = ${disputeId} and game_id = ${g.id} and status = 'open'`;
    if (!d) return fail("That dispute is already settled.");
    if (upheld) {
      const killer = d.raised_by as string;
      await runAction(g.id, (s, c) => {
        const k = s.players.find((p) => p.id === killer);
        if (!k || k.targetId !== d.against) throw new GameError("stale", "Their target has changed since; nothing to do.");
        return E.forceKill(s, c, killer);
      });
    }
    await db()`update disputes set status = ${upheld ? "upheld" : "rejected"} where id = ${disputeId}`;
    await logEvent(g.id, "dispute_resolved", null, d.against as string, { upheld });
  });
}

export async function hostSetWinner(admin: string, playerId: string): Promise<Result> {
  return wrap(async () => void (await host(admin, (s, c) => E.setWinner(s, c, playerId))));
}

export async function hostTick(admin: string): Promise<void> {
  try {
    const g = await gameByAdminToken(admin);
    if (!g) return;
    const r = await runTick(g.id);
    if (r) refresh();
  } catch (e) {
    console.error(e);
  }
}

// ── missions ──

export async function hostAddMission(admin: string, text: string, difficulty: string): Promise<Result> {
  return wrap(async () => {
    const g = await asHost(admin);
    const t = text.trim().slice(0, 200);
    const d = ["E", "M", "H"].includes(difficulty) ? difficulty : "M";
    if (!t) return fail("Write the mission first.");
    await db()`insert into missions (text, difficulty) values (${t}, ${d})
               on conflict (text) do update set active = true, difficulty = excluded.difficulty`;
    await logEvent(g.id, "mission_added", null, null, { text: t, difficulty: d });
    return { ok: true, message: "Mission added." };
  });
}

export async function hostEditMission(admin: string, id: string, text: string, difficulty: string): Promise<Result> {
  return wrap(async () => {
    await asHost(admin);
    const t = text.trim().slice(0, 200);
    const d = ["E", "M", "H"].includes(difficulty) ? difficulty : "M";
    if (!t) return fail("Mission can't be empty.");
    await db()`update missions set text = ${t}, difficulty = ${d} where id = ${id}`;
    return { ok: true, message: "Saved." };
  });
}

export async function hostToggleMission(admin: string, id: string, active: boolean): Promise<Result> {
  return wrap(async () => {
    await asHost(admin);
    await db()`update missions set active = ${active} where id = ${id}`;
  });
}
