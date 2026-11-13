"use client";

import { useActionState, useState } from "react";
import { signUp } from "@/app/actions";
import { shrinkImage } from "@/components/ui";

export function JoinForm() {
  const [state, action, pending] = useActionState(signUp, null);
  const [preview, setPreview] = useState<string | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const small = await shrinkImage(f);
    setPhoto(small);
    setPreview(URL.createObjectURL(small));
  }

  return (
    <form
      className="card"
      action={(fd) => {
        fd.delete("photoPicker");
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
      <label>
        A clear photo of your face (so your hunter can find you)
        <input name="photoPicker" type="file" accept="image/*" onChange={onPhoto} />
      </label>
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
