import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

/** Uploads a photo to the Supabase "photos" bucket and returns its public URL. */
export async function uploadPhoto(file: File): Promise<string> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Photo uploads aren't set up yet.");
  if (!file.type.startsWith("image/")) throw new Error("That file isn't a photo.");
  if (file.size > 3_500_000) throw new Error("That photo is too big.");

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${randomBytes(12).toString("hex")}.${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  const { error } = await supabase.storage.from("photos").upload(path, bytes, { contentType: file.type });
  if (error) throw new Error(`Photo upload failed: ${error.message}`);
  return supabase.storage.from("photos").getPublicUrl(path).data.publicUrl;
}
