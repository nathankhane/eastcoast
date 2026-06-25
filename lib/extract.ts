// ============================================================================
// Server-only LLM extraction — pull apartment facts from a listing webpage.
//
// Google's APIs can't tell us rent, 2BR/2BA, or amenities like a gym or
// basketball court. Those live on the property's website. This module fetches
// the page, strips it to text, and asks an LLM to return structured fields.
//
// Provider is auto-detected: OPENAI_API_KEY (gpt-4o-mini) is preferred, with
// ANTHROPIC_API_KEY (claude-3-5-haiku) as a fallback. If neither is set, the
// caller should treat extraction as unavailable.
// ============================================================================

const OPENAI_KEY = () => process.env.OPENAI_API_KEY;
const ANTHROPIC_KEY = () => process.env.ANTHROPIC_API_KEY;

// Models are overridable via env so we don't hardcode IDs that get retired.
const OPENAI_MODEL = () => process.env.OPENAI_MODEL || "gpt-4o-mini";
const ANTHROPIC_MODEL = () => process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";

export function extractionProvider(): "openai" | "anthropic" | null {
  if (OPENAI_KEY()) return "openai";
  if (ANTHROPIC_KEY()) return "anthropic";
  return null;
}

// The structured shape we ask the model to return. Every field is nullable so
// the model can say "I don't know" instead of hallucinating.
export interface ExtractedFacts {
  priceLow: number | null; // lowest listed 2BR/2BA rent (USD/mo)
  priceHigh: number | null;
  has2br2ba: boolean | null;
  hasGym: boolean | null;
  hasPool: boolean | null;
  hasBasketballCourt: boolean | null;
  basketballCourtType: "none" | "outdoor" | "indoor" | "half-court" | "nearby public court" | "unknown" | null;
  hasCoffee: boolean | null;
  hasBeerOrTap: boolean | null;
  parkingNotes: string;
  availabilityStatus: string;
  priceNotes: string;
  summary: string;
  confidence: number; // 0-1, model's own confidence in the extraction
}

const SYSTEM_PROMPT = `You extract structured facts about a residential apartment community from the text of its website or listing page.
Rules:
- Only use facts present in the provided text. If a fact is not stated, return null (for booleans/numbers) or an empty string (for text). Never guess.
- priceLow/priceHigh: the monthly rent range for 2-bed/2-bath units in USD. If only a general range is shown, use it and note the basis in priceNotes. If no price is shown, return null for both.
- has2br2ba: true only if 2BR/2BA floor plans are clearly offered.
- Amenities (gym, pool, basketball court, coffee, beer/tap lounge): true only if explicitly mentioned; otherwise false if the amenities section is present but doesn't list it, or null if you can't tell.
- basketballCourtType: classify if a basketball court is mentioned; else "none" or null.
- confidence: 0-1 reflecting how much usable info the page actually contained.`;

// ---- page fetch ------------------------------------------------------------

export async function fetchPageText(url: string, maxChars = 12000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });
    if (!res.ok) return "";
    const html = await res.text();
    return htmlToText(html).slice(0, maxChars);
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ---- LLM calls -------------------------------------------------------------

const JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    priceLow: { type: ["number", "null"] },
    priceHigh: { type: ["number", "null"] },
    has2br2ba: { type: ["boolean", "null"] },
    hasGym: { type: ["boolean", "null"] },
    hasPool: { type: ["boolean", "null"] },
    hasBasketballCourt: { type: ["boolean", "null"] },
    basketballCourtType: {
      type: ["string", "null"],
      enum: ["none", "outdoor", "indoor", "half-court", "nearby public court", "unknown", null],
    },
    hasCoffee: { type: ["boolean", "null"] },
    hasBeerOrTap: { type: ["boolean", "null"] },
    parkingNotes: { type: "string" },
    availabilityStatus: { type: "string" },
    priceNotes: { type: "string" },
    summary: { type: "string" },
    confidence: { type: "number" },
  },
  required: [
    "priceLow",
    "priceHigh",
    "has2br2ba",
    "hasGym",
    "hasPool",
    "hasBasketballCourt",
    "basketballCourtType",
    "hasCoffee",
    "hasBeerOrTap",
    "parkingNotes",
    "availabilityStatus",
    "priceNotes",
    "summary",
    "confidence",
  ],
};

function buildUserPrompt(input: { name?: string; address?: string; url?: string; text: string }): string {
  return [
    input.name ? `Community name: ${input.name}` : "",
    input.address ? `Address: ${input.address}` : "",
    input.url ? `Source URL: ${input.url}` : "",
    "",
    "Page text:",
    input.text || "(the page returned no readable text)",
  ]
    .filter(Boolean)
    .join("\n");
}

async function extractWithOpenAI(userPrompt: string): Promise<ExtractedFacts> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_KEY()}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL(),
      temperature: 0,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "apartment_facts", strict: true, schema: JSON_SCHEMA },
      },
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI ${res.status}: ${err.slice(0, 200)}`);
  }
  const data = await res.json();
  return JSON.parse(data.choices[0].message.content) as ExtractedFacts;
}

async function extractWithAnthropic(userPrompt: string): Promise<ExtractedFacts> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_KEY()!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL(),
      max_tokens: 1024,
      temperature: 0,
      system: SYSTEM_PROMPT,
      tools: [
        {
          name: "report_apartment_facts",
          description: "Report the extracted apartment facts.",
          input_schema: JSON_SCHEMA,
        },
      ],
      tool_choice: { type: "tool", name: "report_apartment_facts" },
      messages: [{ role: "user", content: userPrompt }],
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic ${res.status}: ${err.slice(0, 200)}`);
  }
  const data = await res.json();
  const toolUse = (data.content ?? []).find((c: { type: string }) => c.type === "tool_use");
  if (!toolUse) throw new Error("Anthropic returned no tool_use block");
  return toolUse.input as ExtractedFacts;
}

export async function extractApartmentFacts(input: {
  name?: string;
  address?: string;
  url?: string;
  text: string;
}): Promise<ExtractedFacts> {
  const provider = extractionProvider();
  const userPrompt = buildUserPrompt(input);
  if (provider === "openai") return extractWithOpenAI(userPrompt);
  if (provider === "anthropic") return extractWithAnthropic(userPrompt);
  throw new Error("No LLM provider configured");
}
