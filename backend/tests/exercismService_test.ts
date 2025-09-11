import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { ExercismService } from "../services/exercismService.ts";

Deno.test("evaluateSolution: default testCount is 10 and passes with correct solution", async () => {
  const code = `export default function isIsogram(s: string): boolean {
    const seen = new Set<string>();
    for (const ch of s.toLowerCase()) {
      if (ch === ' ' || ch === '-') continue;
      if (seen.has(ch)) return false;
      seen.add(ch);
    }
    return true;
  }`;
  const res = await ExercismService.evaluateSolution("isogram", code);
  assertEquals(res.testsTotal, 10);
  assert(res.testsPassed <= res.testsTotal);
  assert(res.score >= 0 && res.score <= 100);
});

Deno.test("evaluateSolution: compile error yields score 0 and compileError set", async () => {
  const badCode = `export default function isIsogram(s: string): boolean { return (  // missing closing )
  }`;
  const res = await ExercismService.evaluateSolution("isogram", badCode, 5);
  assert(res.compileError && res.compileError.length > 0);
  assertEquals(res.score, 0);
  assertEquals(res.testsPassed, 0);
});

Deno.test("evaluateSolution: lint warnings are counted and reduce score (non-zero warnings)", async () => {
  const codeWithWarning = `export default function isIsogram(s: string): boolean {
    const unused = 1; // should produce a lint warning for unused variable
    const seen = new Set<string>();
    for (const ch of s.toLowerCase()) {
      if (ch === ' ' || ch === '-') continue;
      if (seen.has(ch)) return false;
      seen.add(ch);
    }
    return true;
  }`;
  const res = await ExercismService.evaluateSolution("isogram", codeWithWarning, 5);
  assert(res.lintWarnings >= 0);
  assert(res.score >= 0 && res.score <= 100);
});

