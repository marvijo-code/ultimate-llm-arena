import { OpenRouterService } from "./openRouterService.ts";
import { DbService } from "./dbService.ts";

export interface Exercise {
  id: string;
  name: string;
  language: "javascript";
  totalTests: number;
}

export interface RunRequest {
  exerciseId: string;
  models: string[];
  testCount?: number; // default 10
}

export interface PerModelResult {
  model: string;
  code: string;
  lintWarnings: number;
  lintErrors: number;
  compileError?: string;
  testsPassed: number;
  testsTotal: number;
  score: number;
  error?: string;
}

export interface RunResponse {
  exerciseId: string;
  exerciseName: string;
  testCount: number;
  results: PerModelResult[];
  runId: number;
}

// Import test cases for isogram
import { ISOGRAM_CASES } from "../exercism/isogram/cases.ts";

export class ExercismService {
  static listExercises(): Exercise[] {
    return [
      { id: "isogram", name: "Isogram", language: "javascript", totalTests: ISOGRAM_CASES.length },
    ];
  }

  static buildPrompt(exerciseId: string): string {
    if (exerciseId !== "isogram") throw new Error("Unsupported exercise");
    return (
      "You are participating in a coding evaluation. Implement the required function exactly as specified. " +
      "Do not include any unit tests. Return only the solution code.\n\n" +
      "Task: Implement a function isIsogram(s: string): boolean that returns true if the string is an isogram.\n" +
      "An isogram is a word or phrase without a repeating letter (case-insensitive).\n" +
      "Ignore spaces and hyphens. Treat accented characters as distinct runes (no normalization).\n\n" +
      "Constraints:\n" +
      "- Export the function as a default export from a single file module.\n" +
      "- Use only standard JavaScript/TypeScript.\n" +
      "- Do not include any test code, printing, or explanations.\n\n" +
      "Signature to implement (TypeScript is fine but JS also accepted):\n" +
      "export default function isIsogram(s: string): boolean { /* ... */ }\n\n" +
      "Output ONLY the full code in one code block."
    );
  }

  private static async generateSolutionCode(model: string, prompt: string): Promise<string> {
    // Use OpenRouter with stored API key
    const apiKeyRecord = DbService.getApiKey("OPENROUTER_API_KEY", "OpenRouter");
    if (!apiKeyRecord?.key_value) throw new Error("OpenRouter API key not configured");
    const service = new OpenRouterService(apiKeyRecord.key_value);

    const request = {
      model,
      messages: [
        { role: "user" as const, content: prompt },
      ],
      temperature: 0.2,
      max_tokens: 700,
    };

    const result = await service.generateCompletion(request, model);
    if (result.error) throw new Error(result.error);

    const content: string = result.response?.choices?.[0]?.message?.content || "";
    // Extract code block
    const codeBlockMatch = content.match(/```[a-zA-Z]*\n([\s\S]*?)```/);
    const code = codeBlockMatch ? codeBlockMatch[1].trim() : content.trim();
    return code;
  }

  private static async writeTempSolution(runDir: string, modelSafe: string, code: string): Promise<string> {
    await Deno.mkdir(runDir, { recursive: true });
    const filePath = `${runDir}/${modelSafe}.ts`;
    await Deno.writeTextFile(filePath, code);
    return filePath;
  }

  private static async runDenoLint(filePath: string): Promise<{ warnings: number; errors: number }> {
    const p = new Deno.Command("deno", { args: ["lint", "--json", filePath] });
    const { code, stdout } = await p.output();
    // deno lint exits with 0 if success, 1 if found problems
    const text = new TextDecoder().decode(stdout);
    try {
      const json = JSON.parse(text);
      let warnings = 0, errors = 0;
      for (const d of json.diagnostics || []) {
        if (d.category === "error") errors++;
        else warnings++;
      }
      return { warnings, errors };
    } catch {
      // If cannot parse, assume 0/0 if exit code 0 else one error
      return { warnings: 0, errors: code === 0 ? 0 : 1 };
    }
  }

  private static async tryCompile(filePath: string): Promise<string | undefined> {
    try {
      // Attempt a dynamic import to check for syntax/type errors
      const url = new URL(`file://${filePath}`);
      await import(url.href + `?v=${Date.now()}`);
      return undefined;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  }

  private static async runIsogramTests(modulePath: string, testCount: number): Promise<{ passed: number; total: number }> {
    // Import the solution module and obtain default export
    const { default: isIsogram } = await import(`file://${modulePath}?t=${Date.now()}`) as { default: (s: string) => boolean };
    const total = Math.min(testCount, ISOGRAM_CASES.length);
    let passed = 0;
    for (let i = 0; i < total; i++) {
      const c = ISOGRAM_CASES[i];
      let ok = false;
      try {
        ok = isIsogram(c.input) === c.expected;
      } catch {
        ok = false;
      }
      if (ok) passed++;
    }
    return { passed, total };
  }

  private static scoreFromMetrics(testsPassed: number, testsTotal: number, lintWarnings: number, lintErrors: number, compileError?: string): number {
    if (compileError) return 0;
    const testScore = testsTotal > 0 ? (testsPassed / testsTotal) * 100 : 0;
    const penalty = lintErrors * 5 + lintWarnings * 1;
    const raw = Math.max(0, Math.round(testScore - penalty));
    return raw;
  }

  static async run(request: RunRequest): Promise<RunResponse> {
    const exercise = this.listExercises().find(e => e.id === request.exerciseId);
    if (!exercise) throw new Error("Exercise not found");
    const testCount = request.testCount && request.testCount > 0 ? request.testCount : 10;

    const prompt = this.buildPrompt(exercise.id);
    const runDir = `${Deno.cwd()}/backend/tmp/exercism/${Date.now()}`;

    const results: PerModelResult[] = [];

    await Promise.all(request.models.map(async (model) => {
      const modelSafe = model.replace(/[^a-zA-Z0-9_-]+/g, "_");
      try {
        const code = await this.generateSolutionCode(model, prompt);
        const modulePath = await this.writeTempSolution(runDir, modelSafe, code);
        const { warnings: lintWarnings, errors: lintErrors } = await this.runDenoLint(modulePath);
        const compileError = await this.tryCompile(modulePath);
        let testsPassed = 0, testsTotal = testCount;
        if (!compileError) {
          const res = await this.runIsogramTests(modulePath, testCount);
          testsPassed = res.passed;
          testsTotal = res.total;
        }
        const score = this.scoreFromMetrics(testsPassed, testsTotal, lintWarnings, lintErrors, compileError);
        results.push({ model, code, lintWarnings, lintErrors, compileError, testsPassed, testsTotal, score });
      } catch (e) {
        results.push({ model, code: "", lintWarnings: 0, lintErrors: 0, compileError: undefined, testsPassed: 0, testsTotal: testCount, score: 0, error: e instanceof Error ? e.message : String(e) });
      }
    }));

    const runId = DbService.saveCodeEvalRun({
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      testCount,
      models: request.models,
      results,
    });

    return { exerciseId: exercise.id, exerciseName: exercise.name, testCount, results, runId };
  }


  // Test helper: evaluate a provided solution code without calling an LLM
  static async evaluateSolution(exerciseId: string, code: string, testCount = 10): Promise<PerModelResult> {
    const exercise = this.listExercises().find(e => e.id === exerciseId);
    if (!exercise) throw new Error("Exercise not found");
    const runDir = `${Deno.cwd()}/backend/tmp/exercism/${Date.now()}_test`;
    const modulePath = await this.writeTempSolution(runDir, "solution", code);
    const { warnings: lintWarnings, errors: lintErrors } = await this.runDenoLint(modulePath);
    const compileError = await this.tryCompile(modulePath);
    let testsPassed = 0, testsTotal = Math.min(testCount, exercise.totalTests);
    if (!compileError) {
      if (exerciseId === "isogram") {
        const res = await this.runIsogramTests(modulePath, testsTotal);
        testsPassed = res.passed;
        testsTotal = res.total;
      } else {
        throw new Error("Unsupported exercise");
      }
    }
    const score = this.scoreFromMetrics(testsPassed, testsTotal, lintWarnings, lintErrors, compileError);
    return { model: "local-test", code, lintWarnings, lintErrors, compileError, testsPassed, testsTotal, score };
  }

  static getHistory(limit = 50) {
    return DbService.getCodeEvalRuns(limit);
  }
}

