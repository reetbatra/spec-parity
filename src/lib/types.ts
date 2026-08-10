export type Category = "auth" | "data" | "ui" | "behavior" | "validation";
export type Severity = "critical" | "major" | "minor";

export interface Requirement {
  id: string;
  assertion: string;
  category: Category;
  severity: Severity;
  testable: boolean;
}

export interface TestCase {
  requirementId: string;
  code: string;
}

export interface TestResult {
  requirementId: string;
  passed: boolean;
  error: string | null;
  durationMs: number;
}

export interface SuggestedFix {
  requirementId: string;
  reason: string;
  suggestedFix: string;
}

export interface ReportRow {
  requirement: Requirement;
  result: TestResult | null;
  fix: SuggestedFix | null;
}

export interface Report {
  score: number;
  maxScore: number;
  scorePercent: number;
  totalRequirements: number;
  testableRequirements: number;
  unverifiableRequirements: number;
  passed: number;
  failed: number;
  criticalFailures: number;
  rows: ReportRow[];
}
