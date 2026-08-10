# SpecParity

Verifies that an agent-generated application actually does what its spec said it should.

**Live:** [spec-parity.vercel.app](https://spec-parity.vercel.app)
**Demo target:** [taskflow-demo-eight.vercel.app](https://taskflow-demo-eight.vercel.app) ([source](https://github.com/reetbatra/taskflow-demo)) — a small app with one deliberate bug for SpecParity to catch.

## Problem

Nothing checks whether an agent-generated app actually does what its spec said it would.

## How it works

A plain-language spec goes in as free text. DeepSeek decomposes it into atomic, testable requirements with a severity and category, then generates one Playwright assertion per testable requirement. Those run headless against the live deployed URL, and the results roll into a weighted score where one broken critical requirement can sink it even if everything else passes.

## Architectural tradeoff

The execution engine launches a fresh Chromium instance per test case instead of sharing one browser across a whole run. It costs launch time, but Vercel's serverless Chromium runs single-process, and opening a second browser context on an already-running instance crashed it every time. Isolation won over speed.

## What broke, and how I found it

Execution passed locally, then crashed in production with "Target page, context or browser has been closed." Raising memory to 2048MB didn't help. Stage-by-stage logging placed the crash right after the browser connected, and running one test case against two in the same request made it reproducible: the first browser context always worked, a second one never did. One browser per test case fixed it.

## Known limitations

Requirements a browser can't verify, like "the app should feel modern," are marked unverifiable and reported honestly instead of silently dropped. And because Playwright assertions are generated from spec text alone, without seeing the target's real markup, some generated tests assume implementation details that don't hold, producing false failures the score can't yet tell apart from real bugs.

## Stack

Next.js (App Router), TypeScript, DeepSeek API, Playwright (`playwright-core` + `@sparticuz/chromium` on Vercel), Vercel.
