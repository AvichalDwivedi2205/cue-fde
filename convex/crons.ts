import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
const crons = cronJobs();
crons.interval("Hosted X mentions", { minutes: 1 }, internal.hosted.pollX, {});
export default crons;
