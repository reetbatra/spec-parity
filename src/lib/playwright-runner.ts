import vm from "node:vm";
import type { Browser, Page } from "playwright-core";
import { expect } from "@/lib/expect";
import type { TestCase, TestResult } from "@/lib/types";

const PER_TEST_TIMEOUT_MS = 20000;

async function launchBrowser(): Promise<Browser> {
  if (process.env.VERCEL) {
    console.log("[playwright-runner] importing @sparticuz/chromium");
    const chromium = (await import("@sparticuz/chromium")).default;
    console.log("[playwright-runner] resolving executablePath");
    const executablePath = await chromium.executablePath();
    console.log("[playwright-runner] executablePath resolved:", executablePath);
    const { chromium: playwrightChromium } = await import("playwright-core");
    console.log("[playwright-runner] launching browser");
    const browser = await playwrightChromium.launch({
      args: chromium.args,
      executablePath,
      headless: true,
    });
    console.log("[playwright-runner] browser launched");
    return browser;
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
  console.log(`[playwright-runner] ${testCase.requirementId} newContext`);
  const context = await browser.newContext({ baseURL: baseUrl });
  console.log(`[playwright-runner] ${testCase.requirementId} newPage`);
  const page = await context.newPage();
  console.log(`[playwright-runner] ${testCase.requirementId} running test code`);

  try {
    const run = compileTest(testCase.code);
    await Promise.race([
      run(page, expect),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Test timed out after ${PER_TEST_TIMEOUT_MS}ms`)), PER_TEST_TIMEOUT_MS),
      ),
    ]);
    console.log(`[playwright-runner] ${testCase.requirementId} passed in ${Date.now() - start}ms`);
    return { requirementId: testCase.requirementId, passed: true, error: null, durationMs: Date.now() - start };
  } catch (err) {
    console.log(`[playwright-runner] ${testCase.requirementId} failed in ${Date.now() - start}ms:`, err);
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

  console.log("[playwright-runner] launching browser for", testCases.length, "test case(s)");
  const browser = await launchBrowser();
  try {
    const results: TestResult[] = [];
    for (const testCase of testCases) {
      results.push(await runOne(browser, baseUrl, testCase));
    }
    return results;
  } finally {
    console.log("[playwright-runner] closing browser");
    await browser.close();
    console.log("[playwright-runner] browser closed");
  }
}
