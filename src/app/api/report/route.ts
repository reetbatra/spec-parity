import { NextResponse } from "next/server";
import { z } from "zod";
import { generateStructured } from "@/lib/deepseek";
import { buildReport } from "@/lib/scoring";
import type { Requirement, TestResult, SuggestedFix } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 90;

const fixSchema = z.object({
  requirementId: z.string(),
  reason: z.string(),
  suggestedFix: z.string(),
});

const responseSchema = z.object({
  fixes: z.array(fixSchema),
});

const SYSTEM_PROMPT = `You are reviewing failed automated conformance checks for a deployed web app. For each failure, given the requirement, the test's assertion code, and the error it raised, write:
- reason: one sentence on the likely root cause, grounded in the actual error message (not generic advice).
- suggestedFix: one or two concrete sentences an engineer could act on immediately (what to check or change in the code).

Respond with JSON only: {"fixes": [{"requirementId": "...", "reason": "...", "suggestedFix": "..."}]}`;

export async function POST(request: Request) {
  const body = await request.json();
  const requirements = body?.requirements as Requirement[] | undefined;
  const results = body?.results as TestResult[] | undefined;

  if (!Array.isArray(requirements) || !Array.isArray(results)) {
    return NextResponse.json({ error: "requirements and results are required" }, { status: 400 });
  }

  const failed = results.filter((r) => !r.passed);
  let fixes: SuggestedFix[] = [];

  if (failed.length > 0) {
    const failedWithContext = failed.map((r) => ({
      requirementId: r.requirementId,
      assertion: requirements.find((req) => req.id === r.requirementId)?.assertion ?? "",
      error: r.error,
    }));

    try {
      const result = await generateStructured({
        system: SYSTEM_PROMPT,
        user: JSON.stringify(failedWithContext, null, 2),
        schema: responseSchema,
        maxTokens: 4000,
      });
      fixes = result.fixes;
    } catch {
      // Suggested fixes are best-effort — report still renders failures without them.
      fixes = [];
    }
  }

  const report = buildReport(requirements, results, fixes);
  return NextResponse.json({ report });
}
