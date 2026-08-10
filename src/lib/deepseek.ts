import OpenAI from "openai";
import { z } from "zod";

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      throw new Error("DEEPSEEK_API_KEY is not set");
    }
    client = new OpenAI({ apiKey, baseURL: "https://api.deepseek.com" });
  }
  return client;
}

const DEEPSEEK_MODEL = "deepseek-chat";

/**
 * DeepSeek's JSON mode guarantees valid JSON but not schema conformance, unlike
 * Claude's output_config.format. Validate with zod and retry once with the
 * validation error fed back before giving up.
 */
export async function generateStructured<T>(params: {
  system: string;
  user: string;
  schema: z.ZodType<T>;
  maxTokens?: number;
}): Promise<T> {
  const openai = getClient();
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: params.system },
    { role: "user", content: params.user },
  ];

  for (let attempt = 0; attempt < 2; attempt++) {
    const completion = await openai.chat.completions.create({
      model: DEEPSEEK_MODEL,
      messages,
      response_format: { type: "json_object" },
      max_tokens: params.maxTokens ?? 8000,
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) {
      throw new Error("DeepSeek returned an empty response");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      if (attempt === 0) {
        messages.push({ role: "assistant", content: raw });
        messages.push({
          role: "user",
          content: `That was not valid JSON: ${(err as Error).message}. Return only valid JSON matching the requested shape.`,
        });
        continue;
      }
      throw new Error(`DeepSeek returned invalid JSON: ${(err as Error).message}`);
    }

    const result = params.schema.safeParse(parsed);
    if (result.success) {
      return result.data;
    }

    if (attempt === 0) {
      messages.push({ role: "assistant", content: raw });
      messages.push({
        role: "user",
        content: `That JSON did not match the required shape: ${result.error.message}. Return corrected JSON matching the schema exactly.`,
      });
      continue;
    }

    throw new Error(`DeepSeek output failed schema validation: ${result.error.message}`);
  }

  throw new Error("DeepSeek structured generation failed after retry");
}
