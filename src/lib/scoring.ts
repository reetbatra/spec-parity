import type { Requirement, Severity, TestResult, Report, ReportRow, SuggestedFix } from "@/lib/types";

const WEIGHTS: Record<Severity, number> = {
  critical: 5,
  major: 2,
  minor: 1,
};

export function buildReport(
  requirements: Requirement[],
  results: TestResult[],
  fixes: SuggestedFix[],
): Report {
  const resultById = new Map(results.map((r) => [r.requirementId, r]));
  const fixById = new Map(fixes.map((f) => [f.requirementId, f]));

  const rows: ReportRow[] = requirements.map((requirement) => ({
    requirement,
    result: resultById.get(requirement.id) ?? null,
    fix: fixById.get(requirement.id) ?? null,
  }));

  const testable = rows.filter((r) => r.requirement.testable);
  const maxScore = testable.reduce((sum, r) => sum + WEIGHTS[r.requirement.severity], 0);
  const score = testable.reduce((sum, r) => {
    if (r.result?.passed) return sum + WEIGHTS[r.requirement.severity];
    return sum;
  }, 0);

  const passed = testable.filter((r) => r.result?.passed).length;
  const failed = testable.filter((r) => r.result && !r.result.passed).length;
  const criticalFailures = testable.filter(
    (r) => r.requirement.severity === "critical" && r.result && !r.result.passed,
  ).length;

  return {
    score,
    maxScore,
    scorePercent: maxScore > 0 ? Math.round((score / maxScore) * 100) : 100,
    totalRequirements: requirements.length,
    testableRequirements: testable.length,
    unverifiableRequirements: requirements.length - testable.length,
    passed,
    failed,
    criticalFailures,
    rows,
  };
}
