import sharp from "sharp";
import { api, db, secret } from "./server-store";
import type { Id } from "../convex/_generated/dataModel";
import type { ModelImage } from "./meta";

export async function parseScreenshot(data: string): Promise<ModelImage> {
  const match = data.match(
    /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/,
  );
  if (!match || data.length > 6 * 1024 * 1024)
    throw new Error("Invalid screenshot");
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.toString("base64") !== match[2])
    throw new Error("Invalid screenshot encoding");
  const
    meta = await sharp(bytes, { limitInputPixels: 16000000 }).metadata();
  if (meta.format !== match[1])
    throw new Error("Screenshot type does not match its contents");
  const mimeType = match[1] === "png" ? "image/png" : match[1] === "jpeg" ? "image/jpeg" : "image/webp";
  return { mimeType, data: match[2] };
}

export async function saveAttachment(
  data: string,
  owner: string,
  caseId: Id<"cases">,
) {
  const image = await parseScreenshot(data);
  const bytes = Buffer.from(image.data, "base64");
  const store = db(),
    auth = secret(),
    url = await store.mutation(api.bloom.uploadUrl, { secret: auth });
  const upload = await fetch(url, {
    method: "POST",
    headers: { "content-type": image.mimeType },
    body: bytes,
  });
  if (!upload.ok) throw new Error("Attachment storage failed");
  const { storageId } = await upload.json();
  await store.mutation(api.bloom.attachment, {
    secret: auth,
    owner,
    caseId,
    fileId: storageId,
    name: "Customer screenshot",
  });
}
