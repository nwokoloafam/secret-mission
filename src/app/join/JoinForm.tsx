"use client";

import { useActionState, useState } from "react";
import { signUp } from "@/app/actions";
import { PhotoPicker } from "@/components/ui";

export function JoinForm() {
  const [state, action, pending] = useActionState(signUp, null);
  const [preview, setPreview] = useState<string | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);


  return (
    <form
      className="card"
      action={(fd) => {
        if (photo) fd.set("photo", photo);
        return action(fd);
      }}
    >
      <label>
        First name
        <input name="firstName" autoComplete="given-name" required maxLength={30} />
      </label>
      <label>
        How do you know Afam?
        <input name="how" placeholder="College, work, family…" required maxLength={40} />
      </label>
      <div className="stack">
        <span className="muted" style={{ fontSize: 14 }}>
          A clear photo of your face (so your hunter can find you)
        </span>
        <PhotoPicker
          onPick={(f) => {
            setPhoto(f);
            setPreview(URL.createObjectURL(f));
          }}
        />
      </div>
      {preview && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="Your photo" className="target-photo" style={{ maxWidth: 200 }} />
      )}
      <label>
        Phone (optional, for game texts)
        <input name="phone" type="tel" autoComplete="tel" maxLength={20} />
      </label>
      <label className="row" style={{ display: "flex" }}>
        <input name="sms" type="checkbox" style={{ width: 20, minHeight: 20 }} />
        <span>Text me game updates</span>
      </label>
      {state && !state.ok && <p className="flash error">{state.error}</p>}
      <button className="btn primary" disabled={pending}>
        {pending ? "Submitting…" : "Submit application"}
      </button>
      <p className="muted small">
        You&apos;ll get a personal link. Bookmark it — it&apos;s your way back into the game.
      </p>
    </form>
  );
}
