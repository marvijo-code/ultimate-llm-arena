import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { Application } from "oak";
import exercismRoutes from "../routes/exercism.ts";
import { ExercismService } from "../services/exercismService.ts";

const PASSING_ISOGRAM = `
export default function isIsogram(s: string): boolean {
  const normalized = s.toLowerCase().replace(/[^a-z]/g, "");
  const seen = new Set<string>();
  for (const char of normalized) {
    if (seen.has(char)) return false;
    seen.add(char);
  }
  return true;
}
`.trim();

const FAILING_ISOGRAM = `
export default function isIsogram(): boolean {
  return true;
}
`.trim();

const allowedResultKeys = new Set([
  "model",
  "code",
  "lintWarnings",
  "lintErrors",
  "compileError",
  "testsPassed",
  "testsTotal",
  "score",
  "error",
]);

Deno.test({
  name: "Exercism routes integrate with the service without leaking test cases",
  sanitizeOps: false,
  sanitizeResources: false,
}, async (t) => {
  const app = new Application();
  app.use(exercismRoutes.routes());
  app.use(exercismRoutes.allowedMethods());

  const handleRequest = (request: Request) =>
    (app as unknown as { handle: (req: Request) => Promise<Response> }).handle(
      request,
    );

  const generatorCalls: Record<string, number> = {};
  ExercismService.setCodeGeneratorOverride(async (model) => {
    generatorCalls[model] = (generatorCalls[model] || 0) + 1;
    return model.includes("fail") ? FAILING_ISOGRAM : PASSING_ISOGRAM;
  });

  let recordedRunId = 0;

  try {
    await t.step("lists exercises", async () => {
      const response = await handleRequest(
        new Request("http://localhost/api/exercism/exercises"),
      );
      assertEquals(response.status, 200);
      const body = await response.json();
      assertEquals(body.success, true);
      assert(Array.isArray(body.data));
      assert(body.data.length >= 1);
      const exercise = body.data[0];
      assertEquals(
        Object.keys(exercise).sort(),
        ["id", "language", "name", "totalTests"].sort(),
      );
    });

    await t.step("runs a challenge using stubbed models", async () => {
      const payload = {
        exerciseId: "isogram",
        models: ["local-pass", "local-fail"],
        testCount: 5,
      };
      const response = await handleRequest(
        new Request("http://localhost/api/exercism/run", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        }),
      );
      assertEquals(response.status, 200);
      const { success, data } = await response.json();
      assertEquals(success, true);
      assertEquals(data.exerciseId, "isogram");
      assertEquals(data.results.length, 2);
      recordedRunId = data.runId;

      const passing = data.results.find((r: any) => r.model === "local-pass");
      const failing = data.results.find((r: any) => r.model === "local-fail");
      assert(passing);
      assert(failing);
      assertEquals(passing.testsPassed, passing.testsTotal);
      assert(failing.testsPassed < failing.testsTotal);

      for (const result of data.results) {
        for (const key of Object.keys(result)) {
          assert(
            allowedResultKeys.has(key),
            `Unexpected key ${key} in result payload`,
          );
        }
      }

      assertEquals(generatorCalls["local-pass"], 1);
      assertEquals(generatorCalls["local-fail"], 1);
    });

    await t.step("exercism history contains the recorded run", async () => {
      const response = await handleRequest(
        new Request("http://localhost/api/exercism/history?limit=5"),
      );
      assertEquals(response.status, 200);
      const body = await response.json();
      assertEquals(body.success, true);
      const history = body.data;
      assert(Array.isArray(history));
      const recent = history.find((run: any) => run.id === recordedRunId);
      assert(recent, "Expected run id to be persisted in history");
      assertEquals(recent.exerciseId, "isogram");
      assert(Array.isArray(recent.results));
      assert(recent.results.length >= 1);
    });
  } finally {
    ExercismService.setCodeGeneratorOverride(undefined);
  }
});
