import { KNOWLEDGE_WORKSPACE } from "./knowledge-policy";
import { retrieveKnowledge } from "./knowledge-answer";
import type { Id } from "../convex/_generated/dataModel";
import { readBrandVoice } from "./brand-voice";
export async function growthContext(appId: string, question: string) {
  const [knowledge, brand] = await Promise.all([
    retrieveKnowledge(appId, question, "customer"),
    readBrandVoice(appId),
  ]);
  return {
    hits: knowledge.hits,
    brand,
    grounding: {
      workspaceId: KNOWLEDGE_WORKSPACE,
      chunkIds: knowledge.hits.map((h) => h._id as Id<"knowledgeChunks">),
      retrieval: knowledge.retrieval,
      brandVersion: brand.version,
    },
  };
}
