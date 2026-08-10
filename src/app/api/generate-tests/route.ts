import { NextResponse } from "next/server";
import { z } from "zod";
import { generateStructured } from "@/lib/deepseek";
import type { Requirement } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const testCaseSchema = z.object({
  requirementId: z.string(),
  code: z.string(),
});

const responseSchema = z.object({
  testCases: z.array(testCaseSchema),
});

const SYSTEM_PROMPT = `You write Playwright test code that verifies a single requirement against a live web app.

You will be given a list of requirements and the base URL of the deployed app under test. For each requirement, write the BODY of an async JavaScript function (no function signature, no wrapper) that:
- Has access to two variables already in scope: \`page\` (a Playwright Page, not yet navigated) and \`expect\`, a lightweight assertion helper with ONLY these matchers: expect(locator).toBeVisible(), toBeHidden(), toHaveText(str|regex), toContainText(str|regex), toHaveCount(n), toBeEnabled(), toBeDisabled(), toBeChecked(), toHaveValue(str|regex), toHaveAttribute(name, str|regex); and expect(page).toHaveURL(str|regex), toHaveTitle(str|regex). Do not use any other matcher (no toBeOK, toBeEmpty, toMatchSnapshot, etc.) — they do not exist here and will throw.
- Navigates using relative paths against the base URL, e.g. await page.goto("/login") — do not hardcode the origin.
- Performs the minimum actions needed to exercise the requirement, then asserts the outcome with expect(...) or by throwing an Error with a specific message if a plain condition fails.
- Uses resilient selectors (role, text, label) over brittle CSS/XPath where possible.
- Sets a reasonable timeout expectation implicitly by relying on the assertion helper's built-in retrying; do not add manual sleep/waitForTimeout unless truly necessary.
- Throws (or lets expect throw) on failure with a message that explains what was expected vs observed — that message becomes the reported failure reason.

Do not wrap the code in a function declaration, markdown fences, or comments explaining what Playwright is. Output raw statements only, e.g.:
"await page.goto(\\"/dashboard\\");\\nawait expect(page.getByText(\\"Please log in\\")).toBeVisible();"

Respond with JSON only: {"testCases": [{"requirementId": "...", "code": "..."}]}`;

export async function POST(request: Request) {
  const body = await request.json();
  const requirements = body?.requirements as Requirement[] | undefined;
  const targetUrl = typeof body?.targetUrl === "string" ? body.targetUrl.trim() : "";

  if (!Array.isArray(requirements) || requirements.length === 0) {
    return NextResponse.json({ error: "requirements is required" }, { status: 400 });
  }
  if (!targetUrl) {
    return NextResponse.json({ error: "targetUrl is required" }, { status: 400 });
  }

  const testable = requirements.filter((r) => r.testable);
  if (testable.length === 0) {
    return NextResponse.json({ testCases: [] });
  }

  try {
    const result = await generateStructured({
      system: SYSTEM_PROMPT,
      user: `Base URL: ${targetUrl}\n\nRequirements:\n${JSON.stringify(testable, null, 2)}`,
      schema: responseSchema,
      maxTokens: 6000,
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 502 },
    );
  }
}
