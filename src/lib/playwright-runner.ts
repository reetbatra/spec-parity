import vm from "node:vm";
import type { Browser, Page } from "playwright-core";
import { expect } from "@/lib/expect";
import type { TestCase, TestResult } from "@/lib/types";

const PER_TEST_TIMEOUT_MS = 20000;
const READY_TIMEOUT_MS = 15000;

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

async function launchBrowser(): Promise<Browser> {
  if (process.env.VERCEL) {
    const chromium = (await import("@sparticuz/chromium")).default;
    const executablePath = await chromium.executablePath();
    const { chromium: playwrightChromium } = await import("playwright-core");
    return playwrightChromium.launch({
      args: chromium.args,
      executablePath,
      headless: true,
    });
  }

  const { chromium: playwrightChromium } = await import("playwright-core");
  return playwrightChromium.launch({ headless: true });
}

/**
 * @sparticuz/chromium on Vercel runs Chromium in --single-process mode. A
 * second browser context opened on an already-running instance reliably
 * crashed the process (isolated by testing 1 vs 2 sequential test cases
 * against an identical launch config -- the first context always worked,
 * the second never did). Launching one browser per test case avoids the
 * multi-context path entirely. Launch itself is still occasionally flaky
 * (crashes moments after connecting, or hangs) on a cold Vercel instance,
 * so this retries once with a hard per-attempt timeout before giving up.
 */
async function getReadyPage(baseUrl: string): Promise<{ browser: Browser; page: Page }> {
  const attempt = async () => {
    const browser = await launchBrowser();
    try {
      const context = await browser.newContext({ baseURL: baseUrl });
      const page = await context.newPage();
      return { browser, page };
    } catch (err) {
      await browser.close().catch(() => {});
      throw err;
    }
  };

  try {
    return await withTimeout(attempt(), READY_TIMEOUT_MS, "browser startup");
  } catch {
    return await withTimeout(attempt(), READY_TIMEOUT_MS, "browser startup (retry)");
  }
}

function compileTest(code: string): (page: Page, expectFn: typeof expect) => Promise<void> {
  const sandbox = vm.createContext({});
  const wrapped = `return (async (page, expect) => {\n${code}\n})(page, expect);`;
  const fn = vm.compileFunction(wrapped, ["page", "expect"], {
    parsingContext: sandbox,
  });
  return fn as (page: Page, expectFn: typeof expect) => Promise<void>;
}

async function runOne(baseUrl: string, testCase: TestCase): Promise<TestResult> {
  const start = Date.now();

  let ready: { browser: Browser; page: Page };
  try {
    ready = await getReadyPage(baseUrl);
  } catch (err) {
    return {
      requirementId: testCase.requirementId,
      passed: false,
      error: `Could not start a browser to run this check: ${err instanceof Error ? err.message : String(err)}`,
      durationMs: Date.now() - start,
    };
  }

  const { browser, page } = ready;
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
    await browser.close().catch(() => {});
  }
}

export async function runTestCases(baseUrl: string, testCases: TestCase[]): Promise<TestResult[]> {
  const results: TestResult[] = [];
  for (const testCase of testCases) {
    results.push(await runOne(baseUrl, testCase));
  }
  return results;
}
