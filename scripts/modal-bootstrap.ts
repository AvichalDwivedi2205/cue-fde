import nextEnv from "@next/env";
import { ModalClient } from "modal";
nextEnv.loadEnvConfig(process.cwd());

// Root runs this explicit provisioning command after configuring its Modal account.
// No repository source or account credentials are copied into the image.
const tokenId = process.env.MODAL_TOKEN_ID;
const tokenSecret = process.env.MODAL_TOKEN_SECRET;
if (!tokenId || !tokenSecret) throw new Error("Modal tokens are required");
const appName = process.env.CUE_MODAL_APP || "cue-execution";
const imageName = process.env.CUE_MODAL_IMAGE || "cue-node22-bun1-3-2";
const client = new ModalClient({ tokenId, tokenSecret });
try {
  const app = await client.apps.fromName(appName, { createIfMissing: true });
  const image = await client.images
    .fromRegistry("node:22-bookworm-slim")
    .dockerfileCommands([
      "RUN npm install --global bun@1.3.2",
      "RUN node --version && bun --version && tar --version && setpriv --version",
    ])
    .build(app);
  await image.publish(imageName);
  console.log(JSON.stringify({ appName, imageName, imageId: image.imageId }));
} finally {
  client.close();
}
