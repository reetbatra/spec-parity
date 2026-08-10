import { NextResponse } from "next/server";
import { z } from "zod";
import { generateStructured } from "@/lib/deepseek";

export const runtime = "nodejs";
export const maxDuration = 90;

const requirementSchema = z.object({
  id: z.string(),
  assertion: z.string(),
  category: z.enum(["auth", "data", "ui", "behavior", "validation"]),
  severity: z.enum(["critical", "major", "minor"]),
  testable: z.boolean(),
});

const responseSchema = z.object({
  requirements: z.array(requirementSchema),
});

const SYSTEM_PROMPT = `You decompose a plain-language product spec into a list of atomic, independently testable requirements for QA automation.

Rules:
- Every requirement must be a single, specific, checkable claim about the app's behavior. Split compound sentences into separate requirements.
- id: sequential "REQ-001", "REQ-002", etc.
- category: one of auth, data, ui, behavior, validation.
- severity: critical (breaks core functionality or security), major (a real feature is broken), minor (cosmetic or edge case).
- testable: false for requirements a headless browser cannot verify (e.g. "the design should feel modern", subjective claims, requirements about backend infra with no visible effect). testable: true for anything a Playwright script can check by interacting with the page.
- Do not invent requirements the spec doesn't state or imply. Do not drop requirements because they're hard to test — mark them testable: false instead.

Respond with JSON only: {"requirements": [...]}`;

export async function POST(request: Request) {
  const body = await request.json();
  const spec = typeof body?.spec === "string" ? body.spec.trim() : "";

  if (!spec) {
    return NextResponse.json({ error: "spec is required" }, { status: 400 });
  }

  try {
    const result = await generateStructured({
      system: SYSTEM_PROMPT,
      user: `Spec:\n\n${spec}`,
      schema: responseSchema,
      maxTokens: 4000,
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 502 },
    );
  }
}
