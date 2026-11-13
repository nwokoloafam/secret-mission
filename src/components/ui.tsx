"use client";

import { useRouter } from "next/navigation";
import { ReactNode, useEffect, useState, useTransition } from "react";
import type { Result } from "@/app/actions";

/** Re-fetches the page every few seconds so everyone sees changes live. Optionally runs the timer tick. */
export function AutoRefresh({ seconds = 5, onTick, tickEvery = 30 }: { seconds?: number; onTick?: () => Promise<void>; tickEvery?: number }) {
  const router = useRouter();
  useEffect(() => {
    let last = 0;
    const id = setInterval(async () => {
      if (document.hidden) return;
      const now = Date.now();
      if (onTick && now - last >= tickEvery * 1000) {
        last = now;
        await onTick();
      }
      router.refresh();
    }, seconds * 1000);
    const onVisible = () => !document.hidden && router.refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router, seconds, onTick, tickEvery]);
  return null;
}

/** Shows minutes:seconds until a time, ticking every second. */
export function Countdown({ to, frozen }: { to: string; frozen?: boolean }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const first = setTimeout(() => setNow(Date.now()), 0);
    const id = frozen ? undefined : setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearTimeout(first);
      if (id) clearInterval(id);
    };
  }, [frozen]);
  if (now === null) return <span>--:--</span>;
  const ms = Math.max(0, new Date(to).getTime() - now);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return <span className="mono">{h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`}</span>;
}

/** Runs a server action and shows its result. */
export function useAction() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<Result | null>(null);
  function run(fn: () => Promise<Result>, after?: (r: Result) => void) {
    start(async () => {
      const r = await fn();
      setResult(r);
      after?.(r);
    });
  }
  return { pending, result, setResult, run };
}

export function Flash({ result }: { result: Result | null }) {
  if (!result) return null;
  if (!result.ok) return <p className="flash error">{result.error}</p>;
  if (result.message) return <p className="flash ok">{result.message}</p>;
  return null;
}

export function Btn({
  children,
  onClick,
  pending,
  kind = "primary",
  type = "button",
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  pending?: boolean;
  kind?: "primary" | "ghost" | "danger" | "small";
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  return (
    <button type={type} className={`btn ${kind}`} onClick={onClick} disabled={pending || disabled}>
      {pending ? "…" : children}
    </button>
  );
}

export function Avatar({ url, name, size = 64 }: { url: string | null; name: string; size?: number }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={name} width={size} height={size} className="avatar" style={{ width: size, height: size }} />;
  }
  return (
    <div className="avatar placeholder" style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}

/** Shrinks a phone photo before upload (max 800px, JPEG). */
export async function shrinkImage(file: File, max = 800): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.82));
    if (!blob) return file;
    return new File([blob], "photo.jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}
