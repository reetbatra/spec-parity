"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import type { Requirement, TestCase, TestResult, Report, Severity } from "@/lib/types";

type Stage =
  | "idle"
  | "decomposing"
  | "generating"
  | "executing"
  | "scoring"
  | "done"
  | "error";

const STAGE_LABEL: Record<Stage, string> = {
  idle: "",
  decomposing: "Decomposing spec into requirements…",
  generating: "Generating Playwright assertions…",
  executing: "Running headless checks against the target…",
  scoring: "Scoring conformance…",
  done: "Done",
  error: "Failed",
};

const SEVERITY_VARIANT: Record<Severity, "destructive" | "secondary" | "outline"> = {
  critical: "destructive",
  major: "secondary",
  minor: "outline",
};

const EXAMPLE_SPEC = `A logged-out user cannot view the /dashboard route and is redirected to /login.
The login form requires both an email and a password field to be filled before submission.
After a successful login, the user's name appears in the top navigation bar.
The signup form rejects passwords shorter than 8 characters with a visible error message.
The homepage displays a pricing section with at least three plans.
The app should feel fast and modern.`;

export default function Home() {
  const [spec, setSpec] = useState(EXAMPLE_SPEC);
  const [targetUrl, setTargetUrl] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [results, setResults] = useState<TestResult[]>([]);
  const [report, setReport] = useState<Report | null>(null);

  const running = stage !== "idle" && stage !== "done" && stage !== "error";

  async function postJson<T>(url: string, body: unknown): Promise<T> {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const isJson = res.headers.get("content-type")?.includes("application/json");
    if (!isJson) {
      const text = await res.text();
      throw new Error(
        `${url} returned a non-JSON response (HTTP ${res.status}). This usually means the request timed out upstream — try again.${
          text ? ` Details: ${text.slice(0, 200)}` : ""
        }`,
      );
    }

    const json = await res.json();
    if (!res.ok) {
      throw new Error(json?.error ?? `${url} failed with ${res.status}`);
    }
    return json as T;
  }

  async function handleRun() {
    setErrorMessage(null);
    setReport(null);
    setResults([]);
    setTestCases([]);
    setRequirements([]);

    try {
      setStage("decomposing");
      const { requirements: reqs } = await postJson<{ requirements: Requirement[] }>(
        "/api/decompose",
        { spec },
      );
      setRequirements(reqs);

      setStage("generating");
      const { testCases: cases } = await postJson<{ testCases: TestCase[] }>(
        "/api/generate-tests",
        { requirements: reqs, targetUrl },
      );
      setTestCases(cases);

      setStage("executing");
      const { results: execResults } = await postJson<{ results: TestResult[] }>(
        "/api/execute",
        { testCases: cases, targetUrl },
      );
      setResults(execResults);

      setStage("scoring");
      const { report: finalReport } = await postJson<{ report: Report }>("/api/report", {
        requirements: reqs,
        results: execResults,
      });
      setReport(finalReport);

      setStage("done");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setStage("error");
    }
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">SpecParity</h1>
        <p className="text-muted-foreground">
          Verifies that an agent-generated application actually does what its spec said it should.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>1. Spec &amp; target</CardTitle>
          <CardDescription>
            Paste a plain-language product spec and the deployed URL to check it against.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="spec">Product spec</Label>
            <Textarea
              id="spec"
              value={spec}
              onChange={(e) => setSpec(e.target.value)}
              rows={8}
              disabled={running}
              placeholder="One requirement per line works well."
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="targetUrl">Target URL</Label>
            <Input
              id="targetUrl"
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              disabled={running}
              placeholder="https://your-deployed-app.vercel.app"
            />
          </div>
          <Button onClick={handleRun} disabled={running || !spec.trim() || !targetUrl.trim()}>
            {running ? STAGE_LABEL[stage] : "Run conformance check"}
          </Button>
        </CardContent>
      </Card>

      {errorMessage && (
        <Alert variant="destructive">
          <AlertTitle>Something failed</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      {requirements.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>2. Requirements</CardTitle>
            <CardDescription>{requirements.length} extracted from the spec.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {requirements.map((r) => (
              <div key={r.id} className="flex flex-col gap-1 rounded-md border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{r.id}</span>
                  <Badge variant={SEVERITY_VARIANT[r.severity]}>{r.severity}</Badge>
                  <Badge variant="outline">{r.category}</Badge>
                  {!r.testable && <Badge variant="outline">unverifiable</Badge>}
                </div>
                <p>{r.assertion}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {report && (
        <Card>
          <CardHeader>
            <CardTitle>3. Conformance report</CardTitle>
            <CardDescription>
              Weighted score — critical failures count 5x, major 2x, minor 1x. A high raw pass rate
              with a broken critical requirement should still read as a failing score.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <div className="flex items-baseline gap-4">
              <span
                className={`text-5xl font-bold ${
                  report.scorePercent >= 90
                    ? "text-emerald-600"
                    : report.scorePercent >= 60
                      ? "text-amber-600"
                      : "text-red-600"
                }`}
              >
                {report.scorePercent}%
              </span>
              <div className="text-sm text-muted-foreground">
                <p>
                  {report.passed} passed / {report.failed} failed of {report.testableRequirements} testable
                  requirements
                </p>
                <p>
                  {report.unverifiableRequirements} unverifiable (not machine-checkable — reported honestly,
                  not dropped)
                </p>
                {report.criticalFailures > 0 && (
                  <p className="font-medium text-red-600">
                    {report.criticalFailures} critical failure{report.criticalFailures > 1 ? "s" : ""}
                  </p>
                )}
              </div>
            </div>

            <Separator />

            <div className="flex flex-col gap-3">
              {report.rows.map((row) => (
                <div key={row.requirement.id} className="flex flex-col gap-1 rounded-md border p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{row.requirement.id}</span>
                    <Badge variant={SEVERITY_VARIANT[row.requirement.severity]}>
                      {row.requirement.severity}
                    </Badge>
                    {!row.requirement.testable ? (
                      <Badge variant="outline">unverifiable</Badge>
                    ) : row.result?.passed ? (
                      <Badge className="bg-emerald-600 text-white">pass</Badge>
                    ) : (
                      <Badge variant="destructive">fail</Badge>
                    )}
                  </div>
                  <p>{row.requirement.assertion}</p>
                  {row.result && !row.result.passed && (
                    <div className="mt-1 flex flex-col gap-1 rounded bg-red-50 p-2 text-xs dark:bg-red-950">
                      <p>
                        <span className="font-medium">Failure: </span>
                        {row.result.error}
                      </p>
                      {row.fix && (
                        <p>
                          <span className="font-medium">Suggested fix: </span>
                          {row.fix.suggestedFix}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
