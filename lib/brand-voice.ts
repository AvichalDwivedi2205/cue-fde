import { api, db, secret } from "./server-store";
import { KNOWLEDGE_WORKSPACE } from "./knowledge-policy";
export function readBrandVoice(appId: string) {
  return db().query(api.companyContext.brand, {
    secret: secret(),
    workspaceId: KNOWLEDGE_WORKSPACE,
    appId,
  });
}
