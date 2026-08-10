import vm from "node:vm";
import type { Browser, Page } from "playwright-core";
import { expect } from "@playwright/test";
import type { TestCase, TestResult } from "@/lib/types";

const PER_TEST_TIMEOUT_MS = 20000;

async function launchBrowser(): Promise<Browser> {
  if (process.env.VERCEL) {
    const chromium = (await import("@sparticuz/chromium")).default;
    const { chromium: playwrightChromium } = await import("playwright-core");
    return playwrightChromium.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }

  const { chromium: playwrightChromium } = await import("playwright-core");
  return playwrightChromium.launch({ headless: true });
}

function compileTest(code: string): (page: Page, expectFn: typeof expect) => Promise<void> {
  const sandbox = vm.createContext({});
  const wrapped = `return (async (page, expect) => {\n${code}\n})(page, expect);`;
  const fn = vm.compileFunction(wrapped, ["page", "expect"], {
    parsingContext: sandbox,
  });
  return fn as (page: Page, expectFn: typeof expect) => Promise<void>;
}

async function runOne(browser: Browser, baseUrl: string, testCase: TestCase): Promise<TestResult> {
  const start = Date.now();
  const context = await browser.newContext({ baseURL: baseUrl });
  const page = await context.newPage();

  try {
    const run = compileTest(testCase.code);
    await Promise.race([
      run(page, expect),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Test timed out after ${PER_TEST_TIMEOUT_MS}ms`)), PER_TEST_TIMEOUT_MS),
      ),
    ]);
    return { requirementId: testCase.requirementId, passed: true, error: null, durationMs: Date.now() - start };
  } catch (err) {
    return {
      requirementId: testCase.requirementId,
      passed: false,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
    };
  } finally {
    await context.close();
  }
}

export async function runTestCases(baseUrl: string, testCases: TestCase[]): Promise<TestResult[]> {
  if (testCases.length === 0) return [];

  const browser = await launchBrowser();
  try {
    const results: TestResult[] = [];
    for (const testCase of testCases) {
      results.push(await runOne(browser, baseUrl, testCase));
    }
    return results;
  } finally {
    await browser.close();
  }
}
