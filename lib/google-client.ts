import { GoogleGenAI } from "@google/genai";
import { instrumentModel } from "./observability";

export const geminiReady = () =>
  !!(process.env.GOOGLE_CLOUD_PROJECT || process.env.GEMINI_API_KEY);

export function client(instrument = true) {
  if (!geminiReady())
    throw new Error("Gemini needs a selected Google Cloud project or API key");
  const model = process.env.GEMINI_API_KEY
    ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
    : new GoogleGenAI({
        vertexai: true,
        project: process.env.GOOGLE_CLOUD_PROJECT,
        location: process.env.GOOGLE_CLOUD_LOCATION || "global",
        httpOptions: { timeout: 30000 },
      });
  return instrument
    ? instrumentModel(model, !process.env.GEMINI_API_KEY)
    : model;
}
