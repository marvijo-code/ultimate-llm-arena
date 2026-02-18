import { DbService } from "./dbService.ts";
import { OpenRouterService } from "./openRouterService.ts";

export interface CodingTool {
  id: string;
  name: string;
  description: string;
  // Command template: {workdir}, {model}, {prompt_file} are replaced at runtime
  command: string[];
  // Environment variables to set
  env?: Record<string, string>;
  // Does this tool need an API key env var?
  apiKeyEnvVar?: string;
}

export const CODING_TOOLS: CodingTool[] = [
  {
    id: "aider",
    name: "Aider",
    description: "AI pair programming in your terminal (aider-chat)",
    command: ["aider", "--yes-always", "--no-git", "--model", "{model}", "--message-file", "{prompt_file}"],
    apiKeyEnvVar: "OPENROUTER_API_KEY",
  },
  {
    id: "opencode",
    name: "OpenCode",
    description: "Open-source AI coding agent",
    command: ["opencode", "--non-interactive", "--model", "{model}", "--message-file", "{prompt_file}"],
    apiKeyEnvVar: "OPENROUTER_API_KEY",
  },
  {
    id: "claude-code",
    name: "Claude Code",
    description: "Anthropic's Claude Code CLI",
    command: ["claude", "-p", "{prompt_content}", "--model", "{model}"],
    apiKeyEnvVar: "ANTHROPIC_API_KEY",
  },
  {
    id: "copilot-cli",
    name: "Copilot CLI",
    description: "GitHub Copilot CLI agent",
    command: ["gh", "copilot", "suggest", "-t", "shell", "{prompt_content}"],
  },
  {
    id: "openrouter-direct",
    name: "OpenRouter Direct",
    description: "Call OpenRouter API directly (no external tool needed)",
    command: [],
    apiKeyEnvVar: "OPENROUTER_API_KEY",
  },
];

export interface RepoTestRequest {
  repo_url: string;
  ref: string;             // SHA, branch, or tag
  prompt: string;          // Task description (tests NOT included)
  test_command: string;    // e.g. "npm test", "pytest", "deno test"
  tool: string;            // coding tool id
  model: string;           // model identifier
}

export interface IterationResult {
  iteration: number;
  tool_output: string;
  test_exit_code: number;
  test_stdout: string;
  test_stderr: string;
  tests_passed: number;
  tests_failed: number;
  tests_total: number;
  duration_ms: number;
}

export interface RepoTestResult {
  runId: number;
  repo_url: string;
  ref: string;
  prompt: string;
  test_command: string;
  tool: string;
  model: string;
  status: "success" | "partial" | "fail" | "error";
  iterations: IterationResult[];
  clone_duration_ms: number;
  total_duration_ms: number;
  final_tests_passed: number;
  final_tests_failed: number;
  final_tests_total: number;
  error?: string;
}

type ProgressCallback = (event: {
  type: "status" | "clone" | "iteration_start" | "tool_output" | "test_result" | "complete" | "error";
  message: string;
  data?: any;
}) => void;

const MAX_ITERATIONS = 2;

export class RepoTestService {

  static listTools(): CodingTool[] {
    return CODING_TOOLS;
  }

  static async run(request: RepoTestRequest, onProgress?: ProgressCallback): Promise<RepoTestResult> {
    const totalStart = Date.now();
    const tool = CODING_TOOLS.find(t => t.id === request.tool);
    if (!tool) throw new Error(`Unknown tool: ${request.tool}`);

    // Create DB record
    const runId = DbService.saveRepoTestRun({
      repo_url: request.repo_url,
      ref: request.ref,
      prompt: request.prompt,
      test_command: request.test_command,
      tool: request.tool,
      model: request.model,
      status: "running",
    });

    onProgress?.({ type: "status", message: "Starting repo test run..." });

    let workdir = "";
    const iterations: IterationResult[] = [];

    try {
      // 1. Clone the repo
      onProgress?.({ type: "clone", message: `Cloning ${request.repo_url}...` });
      const cloneStart = Date.now();
      workdir = await this.cloneRepo(request.repo_url, request.ref);
      const cloneDuration = Date.now() - cloneStart;
      onProgress?.({ type: "clone", message: `Cloned in ${cloneDuration}ms`, data: { duration_ms: cloneDuration } });

      DbService.updateRepoTestRun(runId, { clone_duration_ms: cloneDuration, status: "running" });

      // 2. Run up to MAX_ITERATIONS
      let lastTestResult: { exit_code: number; stdout: string; stderr: string; passed: number; failed: number; total: number } | null = null;

      for (let i = 1; i <= MAX_ITERATIONS; i++) {
        onProgress?.({ type: "iteration_start", message: `Iteration ${i}/${MAX_ITERATIONS}`, data: { iteration: i } });
        const iterStart = Date.now();

        // Build the prompt for this iteration
        let iterPrompt: string;
        if (i === 1) {
          // First iteration: just the task prompt, no test details
          iterPrompt = request.prompt;
        } else {
          // Second iteration: include test failure output (NOT the test source code)
          iterPrompt = this.buildRetryPrompt(request.prompt, lastTestResult!);
        }

        // Run the AI coding tool
        const toolOutput = await this.runCodingTool(tool, request.model, iterPrompt, workdir);
        onProgress?.({ type: "tool_output", message: `Tool output (iteration ${i})`, data: { iteration: i, output: toolOutput.substring(0, 2000) } });

        // Run the test suite
        onProgress?.({ type: "status", message: `Running tests (iteration ${i})...` });
        const testResult = await this.runTests(request.test_command, workdir);
        const iterDuration = Date.now() - iterStart;

        lastTestResult = testResult;

        const iterResult: IterationResult = {
          iteration: i,
          tool_output: toolOutput,
          test_exit_code: testResult.exit_code,
          test_stdout: testResult.stdout,
          test_stderr: testResult.stderr,
          tests_passed: testResult.passed,
          tests_failed: testResult.failed,
          tests_total: testResult.total,
          duration_ms: iterDuration,
        };
        iterations.push(iterResult);

        onProgress?.({
          type: "test_result",
          message: `Iteration ${i}: ${testResult.passed}/${testResult.total} tests passed`,
          data: iterResult,
        });

        // If all tests pass, stop early
        if (testResult.exit_code === 0 && testResult.failed === 0) {
          onProgress?.({ type: "status", message: "All tests passed!" });
          break;
        }

        // If this was the last iteration and tests still fail, we're done
        if (i === MAX_ITERATIONS) {
          onProgress?.({ type: "status", message: `Tests still failing after ${MAX_ITERATIONS} iterations` });
        }
      }

      // Determine final status
      const finalIter = iterations[iterations.length - 1];
      const totalDuration = Date.now() - totalStart;
      let status: "success" | "partial" | "fail";
      if (finalIter.tests_failed === 0 && finalIter.test_exit_code === 0) {
        status = "success";
      } else if (finalIter.tests_passed > 0) {
        status = "partial";
      } else {
        status = "fail";
      }

      // Update DB
      DbService.updateRepoTestRun(runId, {
        status,
        tool_duration_ms: iterations.reduce((s, it) => s + it.duration_ms, 0),
        test_duration_ms: iterations.reduce((s, it) => s + it.duration_ms, 0),
        total_duration_ms: totalDuration,
        tests_passed: finalIter.tests_passed,
        tests_failed: finalIter.tests_failed,
        tests_total: finalIter.tests_total,
        test_output: finalIter.test_stdout + "\n" + finalIter.test_stderr,
        tool_output: iterations.map(it => `--- Iteration ${it.iteration} ---\n${it.tool_output}`).join("\n\n"),
      });

      const result: RepoTestResult = {
        runId,
        repo_url: request.repo_url,
        ref: request.ref,
        prompt: request.prompt,
        test_command: request.test_command,
        tool: request.tool,
        model: request.model,
        status,
        iterations,
        clone_duration_ms: cloneDuration,
        total_duration_ms: totalDuration,
        final_tests_passed: finalIter.tests_passed,
        final_tests_failed: finalIter.tests_failed,
        final_tests_total: finalIter.tests_total,
      };

      onProgress?.({ type: "complete", message: "Run complete", data: result });
      return result;

    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      DbService.updateRepoTestRun(runId, { status: "error", error, total_duration_ms: Date.now() - totalStart });
      onProgress?.({ type: "error", message: error });
      throw e;
    } finally {
      // Clean up cloned repo
      if (workdir) {
        try { await Deno.remove(workdir, { recursive: true }); } catch { /* ignore */ }
      }
    }
  }

  private static buildRetryPrompt(
    originalPrompt: string,
    testResult: { stdout: string; stderr: string; passed: number; failed: number; total: number }
  ): string {
    // Give the model the original task + test failure output, but NOT the test source code
    const failureOutput = (testResult.stderr || testResult.stdout || "").substring(0, 4000);
    return (
      `${originalPrompt}\n\n` +
      `--- PREVIOUS ATTEMPT FAILED ---\n` +
      `Tests passed: ${testResult.passed}/${testResult.total}\n` +
      `Tests failed: ${testResult.failed}\n\n` +
      `Test runner output (this is the error output from running the test suite, NOT the test source code):\n` +
      `\`\`\`\n${failureOutput}\n\`\`\`\n\n` +
      `Please fix the code so that all tests pass. Do NOT modify any test files. Only fix the implementation code.`
    );
  }

  private static async cloneRepo(repoUrl: string, ref: string): Promise<string> {
    const tmpBase = `${Deno.cwd()}/backend/tmp/repo-tests`;
    await Deno.mkdir(tmpBase, { recursive: true });
    const workdir = `${tmpBase}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Clone
    const cloneCmd = new Deno.Command("git", {
      args: ["clone", "--depth", "50", repoUrl, workdir],
      stdout: "piped",
      stderr: "piped",
    });
    const cloneResult = await cloneCmd.output();
    if (!cloneResult.success) {
      const stderr = new TextDecoder().decode(cloneResult.stderr);
      throw new Error(`Git clone failed: ${stderr}`);
    }

    // Checkout the specific ref
    const checkoutCmd = new Deno.Command("git", {
      args: ["checkout", ref],
      cwd: workdir,
      stdout: "piped",
      stderr: "piped",
    });
    const checkoutResult = await checkoutCmd.output();
    if (!checkoutResult.success) {
      // Try fetching the ref first (might be a remote branch or tag)
      const fetchCmd = new Deno.Command("git", {
        args: ["fetch", "origin", ref],
        cwd: workdir,
        stdout: "piped",
        stderr: "piped",
      });
      await fetchCmd.output();
      const retry = new Deno.Command("git", {
        args: ["checkout", ref],
        cwd: workdir,
        stdout: "piped",
        stderr: "piped",
      });
      const retryResult = await retry.output();
      if (!retryResult.success) {
        // Last resort: try FETCH_HEAD
        const fetchHead = new Deno.Command("git", {
          args: ["checkout", "FETCH_HEAD"],
          cwd: workdir,
          stdout: "piped",
          stderr: "piped",
        });
        const fhResult = await fetchHead.output();
        if (!fhResult.success) {
          const stderr = new TextDecoder().decode(fhResult.stderr);
          throw new Error(`Git checkout failed for ref '${ref}': ${stderr}`);
        }
      }
    }

    // Install dependencies if package.json/requirements.txt exists
    await this.installDependencies(workdir);

    return workdir;
  }

  private static async installDependencies(workdir: string): Promise<void> {
    // Check for common dependency files
    try {
      const stat = await Deno.stat(`${workdir}/package.json`);
      if (stat.isFile) {
        // Check for package-lock.json or yarn.lock
        let installCmd: Deno.Command;
        try {
          await Deno.stat(`${workdir}/yarn.lock`);
          installCmd = new Deno.Command("yarn", { args: ["install", "--frozen-lockfile"], cwd: workdir, stdout: "piped", stderr: "piped" });
        } catch {
          try {
            await Deno.stat(`${workdir}/pnpm-lock.yaml`);
            installCmd = new Deno.Command("pnpm", { args: ["install", "--frozen-lockfile"], cwd: workdir, stdout: "piped", stderr: "piped" });
          } catch {
            installCmd = new Deno.Command("npm", { args: ["install"], cwd: workdir, stdout: "piped", stderr: "piped" });
          }
        }
        await installCmd.output();
      }
    } catch { /* no package.json */ }

    try {
      const stat = await Deno.stat(`${workdir}/requirements.txt`);
      if (stat.isFile) {
        const cmd = new Deno.Command("pip", { args: ["install", "-r", "requirements.txt"], cwd: workdir, stdout: "piped", stderr: "piped" });
        await cmd.output();
      }
    } catch { /* no requirements.txt */ }
  }

  private static async runCodingTool(tool: CodingTool, model: string, prompt: string, workdir: string): Promise<string> {
    // Special case: openrouter-direct calls the API without an external CLI tool
    if (tool.id === "openrouter-direct") {
      return await this.runOpenRouterDirect(model, prompt, workdir);
    }

    // Write prompt to a temp file
    const promptFile = `${workdir}/.llm-arena-prompt.md`;
    await Deno.writeTextFile(promptFile, prompt);

    // Build command args by substituting placeholders
    const args = tool.command.map(arg =>
      arg
        .replace("{model}", model)
        .replace("{prompt_file}", promptFile)
        .replace("{prompt_content}", prompt)
        .replace("{workdir}", workdir)
    );

    // Build env
    const env: Record<string, string> = { ...tool.env };
    if (tool.apiKeyEnvVar) {
      const apiKeyRecord = DbService.getApiKey("OPENROUTER_API_KEY", "OpenRouter");
      if (apiKeyRecord?.key_value) {
        env[tool.apiKeyEnvVar] = apiKeyRecord.key_value;
        // For aider, set the base URL to OpenRouter
        if (tool.id === "aider") {
          env["OPENAI_API_BASE"] = "https://openrouter.ai/api/v1";
          env["OPENAI_API_KEY"] = apiKeyRecord.key_value;
        }
      }
    }

    const cmd = new Deno.Command(args[0], {
      args: args.slice(1),
      cwd: workdir,
      stdout: "piped",
      stderr: "piped",
      env,
    });

    try {
      const result = await cmd.output();
      const stdout = new TextDecoder().decode(result.stdout);
      const stderr = new TextDecoder().decode(result.stderr);
      return stdout + (stderr ? `\n[STDERR]\n${stderr}` : "");
    } catch (e) {
      return `[Tool execution error: ${e instanceof Error ? e.message : String(e)}]`;
    } finally {
      // Clean up prompt file
      try { await Deno.remove(promptFile); } catch { /* ignore */ }
    }
  }

  private static async runOpenRouterDirect(model: string, prompt: string, workdir: string): Promise<string> {
    const apiKeyRecord = DbService.getApiKey("OPENROUTER_API_KEY", "OpenRouter");
    if (!apiKeyRecord?.key_value) throw new Error("OpenRouter API key not configured");

    const service = new OpenRouterService(apiKeyRecord.key_value);

    // Read the project structure to give context
    let fileList = "";
    try {
      fileList = await this.getFileTree(workdir, 3);
    } catch { /* ignore */ }

    // Read key source files (non-test files) for context
    let sourceContext = "";
    try {
      sourceContext = await this.readSourceFiles(workdir);
    } catch { /* ignore */ }

    const systemPrompt = (
      `You are an expert programmer. You are given a codebase and a task to complete.\n` +
      `You must output ONLY the file changes needed. For each file you need to create or modify, ` +
      `output in this exact format:\n\n` +
      `--- FILE: path/to/file.ext ---\n` +
      `<entire file content>\n` +
      `--- END FILE ---\n\n` +
      `Do NOT modify test files. Only create/modify implementation files.\n` +
      `Do NOT include explanations outside the file blocks.\n\n` +
      `Project structure:\n${fileList}\n\n` +
      (sourceContext ? `Current source files:\n${sourceContext}\n\n` : "")
    );

    const request = {
      model,
      messages: [
        { role: "system" as const, content: systemPrompt },
        { role: "user" as const, content: prompt },
      ],
      temperature: 0.2,
      max_tokens: 4096,
    };

    const result = await service.generateCompletion(request, model);
    if (result.error) throw new Error(result.error);

    const content: string = result.response?.choices?.[0]?.message?.content || "";

    // Apply the file changes
    await this.applyFileChanges(content, workdir);

    return content;
  }

  private static async getFileTree(dir: string, maxDepth: number, prefix = "", depth = 0): Promise<string> {
    if (depth >= maxDepth) return "";
    const lines: string[] = [];
    try {
      for await (const entry of Deno.readDir(dir)) {
        if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "__pycache__" ||
            entry.name === ".git" || entry.name === "venv" || entry.name === ".venv") continue;
        if (entry.isDirectory) {
          lines.push(`${prefix}${entry.name}/`);
          const sub = await this.getFileTree(`${dir}/${entry.name}`, maxDepth, prefix + "  ", depth + 1);
          if (sub) lines.push(sub);
        } else {
          lines.push(`${prefix}${entry.name}`);
        }
      }
    } catch { /* ignore */ }
    return lines.join("\n");
  }

  private static async readSourceFiles(workdir: string): Promise<string> {
    const sourceExts = [".ts", ".js", ".py", ".rs", ".go", ".java", ".c", ".cpp", ".rb", ".ex", ".exs"];
    const testPatterns = ["test", "spec", "_test", "test_"];
    const files: string[] = [];

    const walk = async (dir: string, rel: string) => {
      try {
        for await (const entry of Deno.readDir(dir)) {
          if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "__pycache__" ||
              entry.name === ".git" || entry.name === "venv" || entry.name === ".venv") continue;
          const fullPath = `${dir}/${entry.name}`;
          const relPath = rel ? `${rel}/${entry.name}` : entry.name;
          if (entry.isDirectory) {
            await walk(fullPath, relPath);
          } else {
            const ext = entry.name.substring(entry.name.lastIndexOf("."));
            const nameLower = entry.name.toLowerCase();
            const isTest = testPatterns.some(p => nameLower.includes(p));
            if (sourceExts.includes(ext) && !isTest) {
              files.push(fullPath + "|" + relPath);
            }
          }
        }
      } catch { /* ignore */ }
    };

    await walk(workdir, "");

    // Read up to 10 source files, max 200 lines each
    const parts: string[] = [];
    for (const f of files.slice(0, 10)) {
      const [fullPath, relPath] = f.split("|");
      try {
        const content = await Deno.readTextFile(fullPath);
        const lines = content.split("\n").slice(0, 200).join("\n");
        parts.push(`--- ${relPath} ---\n${lines}\n`);
      } catch { /* ignore */ }
    }
    return parts.join("\n");
  }

  private static async applyFileChanges(content: string, workdir: string): Promise<void> {
    // Parse --- FILE: path --- ... --- END FILE --- blocks
    const fileRegex = /--- FILE:\s*(.+?)\s*---\n([\s\S]*?)--- END FILE ---/g;
    let match;
    while ((match = fileRegex.exec(content)) !== null) {
      const filePath = match[1].trim();
      const fileContent = match[2];

      // Security: prevent path traversal
      const resolved = `${workdir}/${filePath}`;
      if (!resolved.startsWith(workdir)) continue;

      // Create parent directories
      const parentDir = resolved.substring(0, resolved.lastIndexOf("/"));
      try { await Deno.mkdir(parentDir, { recursive: true }); } catch { /* ignore */ }

      await Deno.writeTextFile(resolved, fileContent);
    }

    // Also handle markdown code blocks with filenames: ```lang:path/to/file
    // or "# filename: path/to/file" patterns
    const codeBlockRegex = /```\w*(?::|\s+)([^\n`]+)\n([\s\S]*?)```/g;
    while ((match = codeBlockRegex.exec(content)) !== null) {
      const possiblePath = match[1].trim();
      // Only apply if it looks like a file path
      if (possiblePath.includes("/") || possiblePath.includes(".")) {
        const resolved = `${workdir}/${possiblePath}`;
        if (!resolved.startsWith(workdir)) continue;
        const parentDir = resolved.substring(0, resolved.lastIndexOf("/"));
        try { await Deno.mkdir(parentDir, { recursive: true }); } catch { /* ignore */ }
        await Deno.writeTextFile(resolved, match[2]);
      }
    }
  }

  private static async runTests(testCommand: string, workdir: string): Promise<{
    exit_code: number; stdout: string; stderr: string;
    passed: number; failed: number; total: number;
  }> {
    // Split command intelligently
    const parts = testCommand.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [testCommand];
    const cleanParts = parts.map(p => p.replace(/^["']|["']$/g, ""));

    // Determine shell based on OS
    const isWindows = Deno.build.os === "windows";
    let cmd: Deno.Command;
    if (isWindows) {
      cmd = new Deno.Command("cmd", {
        args: ["/c", ...cleanParts],
        cwd: workdir,
        stdout: "piped",
        stderr: "piped",
      });
    } else {
      cmd = new Deno.Command("sh", {
        args: ["-c", testCommand],
        cwd: workdir,
        stdout: "piped",
        stderr: "piped",
      });
    }

    const result = await cmd.output();
    const stdout = new TextDecoder().decode(result.stdout);
    const stderr = new TextDecoder().decode(result.stderr);

    // Parse test results from output
    const { passed, failed, total } = this.parseTestOutput(stdout + "\n" + stderr);

    return {
      exit_code: result.code,
      stdout: stdout.substring(0, 50000),
      stderr: stderr.substring(0, 50000),
      passed,
      failed,
      total,
    };
  }

  private static parseTestOutput(output: string): { passed: number; failed: number; total: number } {
    let passed = 0, failed = 0, total = 0;

    // Try various test framework output patterns

    // Jest / Vitest: "Tests: X failed, Y passed, Z total"
    const jestMatch = output.match(/Tests:\s+(?:(\d+)\s+failed,?\s*)?(?:(\d+)\s+passed,?\s*)?(\d+)\s+total/);
    if (jestMatch) {
      failed = parseInt(jestMatch[1] || "0");
      passed = parseInt(jestMatch[2] || "0");
      total = parseInt(jestMatch[3] || "0");
      return { passed, failed, total };
    }

    // pytest: "X passed, Y failed" or "X passed"
    const pytestMatch = output.match(/(\d+)\s+passed(?:,\s+(\d+)\s+failed)?/);
    if (pytestMatch) {
      passed = parseInt(pytestMatch[1] || "0");
      failed = parseInt(pytestMatch[2] || "0");
      total = passed + failed;
      return { passed, failed, total };
    }

    // pytest: "Y failed, X passed"
    const pytestMatch2 = output.match(/(\d+)\s+failed(?:,\s+(\d+)\s+passed)?/);
    if (pytestMatch2) {
      failed = parseInt(pytestMatch2[1] || "0");
      passed = parseInt(pytestMatch2[2] || "0");
      total = passed + failed;
      return { passed, failed, total };
    }

    // Deno test: "X passed | Y failed"
    const denoMatch = output.match(/(\d+)\s+passed\s*\|\s*(\d+)\s+failed/);
    if (denoMatch) {
      passed = parseInt(denoMatch[1]);
      failed = parseInt(denoMatch[2]);
      total = passed + failed;
      return { passed, failed, total };
    }

    // Go test: "ok" or "FAIL"
    const goPass = (output.match(/--- PASS/g) || []).length;
    const goFail = (output.match(/--- FAIL/g) || []).length;
    if (goPass + goFail > 0) {
      passed = goPass;
      failed = goFail;
      total = passed + failed;
      return { passed, failed, total };
    }

    // RSpec: "X examples, Y failures"
    const rspecMatch = output.match(/(\d+)\s+examples?,\s+(\d+)\s+failures?/);
    if (rspecMatch) {
      total = parseInt(rspecMatch[1]);
      failed = parseInt(rspecMatch[2]);
      passed = total - failed;
      return { passed, failed, total };
    }

    // Mocha: "X passing" "Y failing"
    const mochaPass = output.match(/(\d+)\s+passing/);
    const mochaFail = output.match(/(\d+)\s+failing/);
    if (mochaPass) {
      passed = parseInt(mochaPass[1]);
      failed = mochaFail ? parseInt(mochaFail[1]) : 0;
      total = passed + failed;
      return { passed, failed, total };
    }

    // Cargo test: "test result: ok. X passed; Y failed"
    const cargoMatch = output.match(/test result:.*?(\d+)\s+passed;\s+(\d+)\s+failed/);
    if (cargoMatch) {
      passed = parseInt(cargoMatch[1]);
      failed = parseInt(cargoMatch[2]);
      total = passed + failed;
      return { passed, failed, total };
    }

    // Generic: count "PASS"/"FAIL" or "ok"/"not ok" (TAP format)
    const tapPass = (output.match(/^ok\s+\d+/gm) || []).length;
    const tapFail = (output.match(/^not ok\s+\d+/gm) || []).length;
    if (tapPass + tapFail > 0) {
      passed = tapPass;
      failed = tapFail;
      total = passed + failed;
      return { passed, failed, total };
    }

    // Fallback: if exit code 0 reported elsewhere, assume pass
    return { passed: 0, failed: 0, total: 0 };
  }

  static getHistory(limit = 50) {
    return DbService.getRepoTestRuns(limit);
  }

  static getRun(id: number) {
    return DbService.getRepoTestRun(id);
  }
}
