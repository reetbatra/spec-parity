import type { Locator, Page } from "playwright-core";

/**
 * Minimal Playwright-style `expect` for the serverless execution sandbox.
 *
 * `@playwright/test`'s real `expect` pulls in the full `playwright` package
 * (browser-download management, `browsers.json`, etc.) which Next's output
 * file tracing does not carry into the Vercel function bundle. This
 * implements the subset of matchers LLM-generated test code actually uses,
 * with the same auto-retrying semantics, against plain `playwright-core`.
 */

const DEFAULT_TIMEOUT_MS = 5000;
const POLL_INTERVAL_MS = 100;

interface MatcherOptions {
  timeout?: number;
}

async function poll(
  check: () => Promise<boolean>,
  describe: () => Promise<string>,
  options?: MatcherOptions,
): Promise<void> {
  const timeout = options?.timeout ?? DEFAULT_TIMEOUT_MS;
  const deadline = Date.now() + timeout;
  let lastError: unknown = null;

  while (Date.now() < deadline) {
    try {
      if (await check()) return;
    } catch (err) {
      lastError = err;
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  const detail = await describe().catch(() => "<failed to inspect actual value>");
  const cause = lastError instanceof Error ? ` (${lastError.message})` : "";
  throw new Error(`Expectation failed after ${timeout}ms: ${detail}${cause}`);
}

function isLocator(target: unknown): target is Locator {
  return typeof (target as Locator)?.waitFor === "function" && typeof (target as Locator)?.count === "function";
}

function isPage(target: unknown): target is Page {
  return typeof (target as Page)?.url === "function" && typeof (target as Page)?.goto === "function";
}

function matches(actual: string, expected: string | RegExp): boolean {
  return expected instanceof RegExp ? expected.test(actual) : actual === expected;
}

function contains(actual: string, expected: string | RegExp): boolean {
  return expected instanceof RegExp ? expected.test(actual) : actual.includes(expected);
}

export type ExpectTarget = Locator | Page;

export function expect(target: ExpectTarget) {
  const locator = isLocator(target) ? target : null;
  const page = isPage(target) ? target : null;

  const matchers = {
    async toBeVisible(options?: MatcherOptions) {
      if (!locator) throw new Error("toBeVisible() requires a Locator");
      await locator.waitFor({ state: "visible", timeout: options?.timeout ?? DEFAULT_TIMEOUT_MS });
    },
    async toBeHidden(options?: MatcherOptions) {
      if (!locator) throw new Error("toBeHidden() requires a Locator");
      await locator.waitFor({ state: "hidden", timeout: options?.timeout ?? DEFAULT_TIMEOUT_MS });
    },
    async toHaveText(expected: string | RegExp, options?: MatcherOptions) {
      if (!locator) throw new Error("toHaveText() requires a Locator");
      await poll(
        async () => matches((await locator.textContent()) ?? "", expected),
        async () => `expected text to equal ${expected}, got "${await locator.textContent()}"`,
        options,
      );
    },
    async toContainText(expected: string | RegExp, options?: MatcherOptions) {
      if (!locator) throw new Error("toContainText() requires a Locator");
      await poll(
        async () => contains((await locator.textContent()) ?? "", expected),
        async () => `expected text to contain ${expected}, got "${await locator.textContent()}"`,
        options,
      );
    },
    async toHaveCount(expected: number, options?: MatcherOptions) {
      if (!locator) throw new Error("toHaveCount() requires a Locator");
      await poll(
        async () => (await locator.count()) === expected,
        async () => `expected count ${expected}, got ${await locator.count()}`,
        options,
      );
    },
    async toHaveURL(expected: string | RegExp, options?: MatcherOptions) {
      if (!page) throw new Error("toHaveURL() requires a Page");
      await poll(
        async () => matches(page.url(), expected),
        async () => `expected URL to equal ${expected}, got "${page.url()}"`,
        options,
      );
    },
    async toHaveTitle(expected: string | RegExp, options?: MatcherOptions) {
      if (!page) throw new Error("toHaveTitle() requires a Page");
      await poll(
        async () => matches(await page.title(), expected),
        async () => `expected title to equal ${expected}, got "${await page.title()}"`,
        options,
      );
    },
    async toBeEnabled(options?: MatcherOptions) {
      if (!locator) throw new Error("toBeEnabled() requires a Locator");
      await poll(
        async () => locator.isEnabled(),
        async () => "expected element to be enabled",
        options,
      );
    },
    async toBeDisabled(options?: MatcherOptions) {
      if (!locator) throw new Error("toBeDisabled() requires a Locator");
      await poll(
        async () => locator.isDisabled(),
        async () => "expected element to be disabled",
        options,
      );
    },
    async toBeChecked(options?: MatcherOptions) {
      if (!locator) throw new Error("toBeChecked() requires a Locator");
      await poll(
        async () => locator.isChecked(),
        async () => "expected element to be checked",
        options,
      );
    },
    async toHaveValue(expected: string | RegExp, options?: MatcherOptions) {
      if (!locator) throw new Error("toHaveValue() requires a Locator");
      await poll(
        async () => matches(await locator.inputValue(), expected),
        async () => `expected value to equal ${expected}, got "${await locator.inputValue()}"`,
        options,
      );
    },
    async toHaveAttribute(name: string, expected: string | RegExp, options?: MatcherOptions) {
      if (!locator) throw new Error("toHaveAttribute() requires a Locator");
      await poll(
        async () => matches((await locator.getAttribute(name)) ?? "", expected),
        async () => `expected attribute "${name}" to equal ${expected}, got "${await locator.getAttribute(name)}"`,
        options,
      );
    },
  };

  return new Proxy(matchers, {
    get(obj, prop: string, receiver) {
      if (prop in obj) return Reflect.get(obj, prop, receiver);
      return () => {
        throw new Error(`Unsupported assertion: expect(...).${String(prop)} is not available in this sandbox`);
      };
    },
  }) as typeof matchers;
}
