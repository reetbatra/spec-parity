import { NextResponse } from "next/server";
import type { TestCase } from "@/lib/types";
import { runTestCases } from "@/lib/playwright-runner";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  const body = await request.json();
  const testCases = body?.testCases as TestCase[] | undefined;
  const targetUrl = typeof body?.targetUrl === "string" ? body.targetUrl.trim() : "";

  if (!Array.isArray(testCases)) {
    return NextResponse.json({ error: "testCases is required" }, { status: 400 });
  }
  if (!targetUrl) {
    return NextResponse.json({ error: "targetUrl is required" }, { status: 400 });
  }

  try {
    const results = await runTestCases(targetUrl, testCases);
    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 502 },
    );
  }
}
