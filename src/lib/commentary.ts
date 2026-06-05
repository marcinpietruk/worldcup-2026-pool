import OpenAI from "openai";
import { log } from "./log";
import { digestFacts, type DigestData } from "./digest";

// Generates a short, football-commentator-style intro for the daily digest using
// OpenAI (GPT-5.4 nano by default — pennies per month). It is grounded strictly
// in the digest facts so it can't invent results. Returns null when unconfigured,
// when there's nothing to narrate, or on any error — the digest must always be
// able to post with or without the flourish.
//
//   OPENAI_API_KEY         required to enable commentary
//   OPENAI_MODEL           model (direct OpenAI) or deployment name (Azure); default "gpt-5.4-nano"
//   AZURE_OPENAI_ENDPOINT  set to use Azure OpenAI, e.g.
//                          https://<resource>.cognitiveservices.azure.com/openai/v1/
//                          (the standard SDK works against Azure's v1 surface)

export function commentaryConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

// One client for either backend: direct OpenAI, or Azure OpenAI when an endpoint
// is set. Azure's v1 API accepts the resource key on the Authorization header,
// so the only difference is the base URL.
function makeClient(): OpenAI {
  const baseURL = process.env.AZURE_OPENAI_ENDPOINT || process.env.OPENAI_BASE_URL;
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    ...(baseURL ? { baseURL } : {}),
  });
}

const SYSTEM = `You are the resident football commentator for a small office World Cup 2026 prediction pool. Each morning you write a short, lively recap for the group's Slack channel.

You'll be given a JSON object of FACTS: yesterday's match results, the current standings (each with "change" = places moved since the last recap; positive means climbed, negative means dropped), how many points each player won and how many exact scorelines they nailed, a standout "prediction of the day", a "flop of the day", and today's fixtures.

Write 2-4 sentences of punchy, broadcaster-style commentary, in the spirit of:
"A winner for Ghana, and Marcin storms to the top of the table — the only one who called the 2-1." Tie the on-pitch results to the pool race: who climbed, who slipped, whose bold call paid off, who to gently tease for a flop.

Hard rules:
- Use ONLY the facts in the JSON. Never invent a goal, scorer, minute, scoreline, or standings change that isn't given. You have final scores and standings only — you do NOT know goal times or scorers, so never say "last-minute" or name footballers.
- The names in standings / predictionOfTheDay / flopOfTheDay are the POOL PLAYERS (the user's colleagues), not footballers. Refer to them by their exact names.
- Warm and a little cheeky is good; never mean. A gentle ribbing of the flop of the day is welcome.
- Output ONLY the commentary text: no preamble, headings, bullet points, emoji, surrounding quotes, or notes about your reasoning.`;

export async function generateCommentary(d: DigestData): Promise<string | null> {
  if (!commentaryConfigured()) return null;
  if (d.recap.length === 0) return null; // no results since last digest → nothing to narrate

  try {
    const client = makeClient();
    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5.4-nano",
      reasoning: { effort: "low" },
      instructions: SYSTEM,
      input: [{ role: "user", content: JSON.stringify(digestFacts(d)) }],
      max_output_tokens: 800,
    });
    const text = response.output_text?.trim();
    return text || null;
  } catch (e) {
    log.error("commentary.failed", { error: e instanceof Error ? e.message : String(e) });
    return null; // never let a commentary hiccup block the digest
  }
}

// Lightweight connectivity check — confirms the key/endpoint/model authenticate
// without needing live match data. Used by the route's ?selftest=1. No side effects.
export async function probeOpenAI(): Promise<{ ok: boolean; model: string; sample?: string; error?: string }> {
  const model = process.env.OPENAI_MODEL || "gpt-5.4-nano";
  if (!commentaryConfigured()) return { ok: false, model, error: "OPENAI_API_KEY not set" };
  try {
    const client = makeClient();
    const r = await client.responses.create({
      model,
      reasoning: { effort: "low" },
      input: [{ role: "user", content: "Reply with exactly one word: pong" }],
      max_output_tokens: 200,
    });
    return { ok: true, model, sample: (r.output_text || "").trim().slice(0, 40) };
  } catch (e) {
    return { ok: false, model, error: e instanceof Error ? e.message : String(e) };
  }
}
