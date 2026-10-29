import { z } from "zod";

export const waitlistEmail = z.string().trim().toLowerCase().max(254).email();

export const waitlistSubmission = z
  .object({
    email: waitlistEmail,
    website: z.string().max(200).optional(),
  })
  .strict();
