/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as appPacks from "../appPacks.js";
import type * as background from "../background.js";
import type * as bloom from "../bloom.js";
import type * as commitMetadata from "../commitMetadata.js";
import type * as companyContext from "../companyContext.js";
import type * as companyContextSchema from "../companyContextSchema.js";
import type * as crons from "../crons.js";
import type * as cue from "../cue.js";
import type * as deliveries from "../deliveries.js";
import type * as demoEvidence from "../demoEvidence.js";
import type * as engineeringHandoffState from "../engineeringHandoffState.js";
import type * as engineeringHandoffValidators from "../engineeringHandoffValidators.js";
import type * as engineeringSlack from "../engineeringSlack.js";
import type * as feedbackGaps from "../feedbackGaps.js";
import type * as feedbackSchema from "../feedbackSchema.js";
import type * as growth from "../growth.js";
import type * as growthAttribution from "../growthAttribution.js";
import type * as growthExecution from "../growthExecution.js";
import type * as growthPolicy from "../growthPolicy.js";
import type * as growthSchema from "../growthSchema.js";
import type * as growthTasks from "../growthTasks.js";
import type * as hosted from "../hosted.js";
import type * as intake from "../intake.js";
import type * as jobs from "../jobs.js";
import type * as knowledge from "../knowledge.js";
import type * as knowledgeInternal from "../knowledgeInternal.js";
import type * as knowledgeSchema from "../knowledgeSchema.js";
import type * as previewAcceptance from "../previewAcceptance.js";
import type * as previewAcceptanceValidators from "../previewAcceptanceValidators.js";
import type * as prospectResearch from "../prospectResearch.js";
import type * as prospectSchema from "../prospectSchema.js";
import type * as prospects from "../prospects.js";
import type * as rehearsalScope from "../rehearsalScope.js";
import type * as rehearsals from "../rehearsals.js";
import type * as releases from "../releases.js";
import type * as serverState from "../serverState.js";
import type * as signalSchema from "../signalSchema.js";
import type * as signals from "../signals.js";
import type * as supportDeliveries from "../supportDeliveries.js";
import type * as supportDeliveryValidators from "../supportDeliveryValidators.js";
import type * as triageQueue from "../triageQueue.js";
import type * as voice from "../voice.js";
import type * as waitlist from "../waitlist.js";
import type * as widgetContact from "../widgetContact.js";
import type * as workspace from "../workspace.js";
import type * as workspaceAnswers from "../workspaceAnswers.js";
import type * as workspaceValidators from "../workspaceValidators.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  appPacks: typeof appPacks;
  background: typeof background;
  bloom: typeof bloom;
  commitMetadata: typeof commitMetadata;
  companyContext: typeof companyContext;
  companyContextSchema: typeof companyContextSchema;
  crons: typeof crons;
  cue: typeof cue;
  deliveries: typeof deliveries;
  demoEvidence: typeof demoEvidence;
  engineeringHandoffState: typeof engineeringHandoffState;
  engineeringHandoffValidators: typeof engineeringHandoffValidators;
  engineeringSlack: typeof engineeringSlack;
  feedbackGaps: typeof feedbackGaps;
  feedbackSchema: typeof feedbackSchema;
  growth: typeof growth;
  growthAttribution: typeof growthAttribution;
  growthExecution: typeof growthExecution;
  growthPolicy: typeof growthPolicy;
  growthSchema: typeof growthSchema;
  growthTasks: typeof growthTasks;
  hosted: typeof hosted;
  intake: typeof intake;
  jobs: typeof jobs;
  knowledge: typeof knowledge;
  knowledgeInternal: typeof knowledgeInternal;
  knowledgeSchema: typeof knowledgeSchema;
  previewAcceptance: typeof previewAcceptance;
  previewAcceptanceValidators: typeof previewAcceptanceValidators;
  prospectResearch: typeof prospectResearch;
  prospectSchema: typeof prospectSchema;
  prospects: typeof prospects;
  rehearsalScope: typeof rehearsalScope;
  rehearsals: typeof rehearsals;
  releases: typeof releases;
  serverState: typeof serverState;
  signalSchema: typeof signalSchema;
  signals: typeof signals;
  supportDeliveries: typeof supportDeliveries;
  supportDeliveryValidators: typeof supportDeliveryValidators;
  triageQueue: typeof triageQueue;
  voice: typeof voice;
  waitlist: typeof waitlist;
  widgetContact: typeof widgetContact;
  workspace: typeof workspace;
  workspaceAnswers: typeof workspaceAnswers;
  workspaceValidators: typeof workspaceValidators;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  triagePool: import("@convex-dev/workpool/_generated/component.js").ComponentApi<"triagePool">;
  knowledgePool: import("@convex-dev/workpool/_generated/component.js").ComponentApi<"knowledgePool">;
  agent: import("@convex-dev/agent/_generated/component.js").ComponentApi<"agent">;
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
};
