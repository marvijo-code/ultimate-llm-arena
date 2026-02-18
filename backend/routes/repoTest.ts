import { Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { RepoTestService } from "../services/repoTestService.ts";
import { OpenRouterService } from "../services/openRouterService.ts";
import { DbService } from "../services/dbService.ts";

const router = new Router({ prefix: "/api/repo-test" });

// List available coding tools
router.get("/tools", async (ctx) => {
  try {
    const tools = await RepoTestService.listTools();
    ctx.response.body = { success: true, data: tools };
  } catch (error) {
    ctx.response.status = 500;
    ctx.response.body = { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
});

// Run a repo test (SSE streaming)
router.post("/run", async (ctx) => {
  try {
    const body = await ctx.request.body({ type: "json" }).value;
    const { repo_url, ref, prompt, test_command, tool, model } = body || {};

    if (!repo_url || !ref || !prompt || !test_command || !tool || !model) {
      ctx.response.status = 400;
      ctx.response.body = {
        success: false,
        error: "repo_url, ref, prompt, test_command, tool, and model are all required",
      };
      return;
    }

    // Set up SSE
    ctx.response.headers.set("Content-Type", "text/event-stream");
    ctx.response.headers.set("Cache-Control", "no-cache");
    ctx.response.headers.set("Connection", "keep-alive");
    ctx.response.headers.set("X-Accel-Buffering", "no");

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (event: any) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          } catch { /* stream closed */ }
        };

        try {
          const result = await RepoTestService.run(
            { repo_url, ref, prompt, test_command, tool, model },
            (progress) => sendEvent(progress),
          );
          sendEvent({ type: "complete", message: "Run complete", data: result });
        } catch (e) {
          sendEvent({ type: "error", message: e instanceof Error ? e.message : String(e) });
        } finally {
          try {
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          } catch { /* ignore */ }
        }
      },
    });

    ctx.response.body = stream;
  } catch (error) {
    ctx.response.status = 500;
    ctx.response.body = { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
});

// Run a repo test (non-streaming, returns full result)
router.post("/run-sync", async (ctx) => {
  try {
    const body = await ctx.request.body({ type: "json" }).value;
    const { repo_url, ref, prompt, test_command, tool, model } = body || {};

    if (!repo_url || !ref || !prompt || !test_command || !tool || !model) {
      ctx.response.status = 400;
      ctx.response.body = {
        success: false,
        error: "repo_url, ref, prompt, test_command, tool, and model are all required",
      };
      return;
    }

    const result = await RepoTestService.run({ repo_url, ref, prompt, test_command, tool, model });
    ctx.response.body = { success: true, data: result };
  } catch (error) {
    ctx.response.status = 500;
    ctx.response.body = { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
});

// Get run history
router.get("/history", (ctx) => {
  try {
    const limit = parseInt(ctx.request.url.searchParams.get("limit") || "50");
    const data = RepoTestService.getHistory(limit);
    ctx.response.body = { success: true, data };
  } catch (error) {
    ctx.response.status = 500;
    ctx.response.body = { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
});

// Get a specific run
router.get("/runs/:id", (ctx) => {
  try {
    const id = parseInt(ctx.params.id || "0");
    const data = RepoTestService.getRun(id);
    if (!data) {
      ctx.response.status = 404;
      ctx.response.body = { success: false, error: "Run not found" };
      return;
    }
    ctx.response.body = { success: true, data };
  } catch (error) {
    ctx.response.status = 500;
    ctx.response.body = { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
});

// Get available free models from OpenRouter
router.get("/models", async (ctx) => {
  try {
    const apiKeyRecord = DbService.getApiKey("OPENROUTER_API_KEY", "OpenRouter");
    if (!apiKeyRecord?.key_value) {
      ctx.response.status = 400;
      ctx.response.body = { success: false, error: "OpenRouter API key not configured" };
      return;
    }

    const service = new OpenRouterService(apiKeyRecord.key_value);
    const models = await service.getModels();

    // Filter to only include free models and format the response
    const freeModels = models
      .filter((m: any) => m.id?.endsWith(':free') || m.pricing?.prompt === 0)
      .map((m: any) => ({
        id: m.id,
        name: m.name || m.id.split('/').pop(),
        provider: m.provider || m.id.split('/')[0],
        description: m.description,
        context_length: m.context_length,
      }))
      .sort((a: any, b: any) => a.provider.localeCompare(b.provider));

    ctx.response.body = { success: true, data: freeModels };
  } catch (error) {
    ctx.response.status = 500;
    ctx.response.body = { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
});

// Batch run: test multiple models simultaneously
router.post("/batch", async (ctx) => {
  try {
    const body = await ctx.request.body({ type: "json" }).value;
    const { repo_url, ref, prompt, test_command, tool, models } = body || {};

    if (!repo_url || !ref || !prompt || !test_command || !tool || !models || !Array.isArray(models) || models.length === 0) {
      ctx.response.status = 400;
      ctx.response.body = {
        success: false,
        error: "repo_url, ref, prompt, test_command, tool, and models array are all required",
      };
      return;
    }

    // Return batch ID immediately, then run in background
    const batchId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Set up SSE for streaming progress
    ctx.response.headers.set("Content-Type", "text/event-stream");
    ctx.response.headers.set("Cache-Control", "no-cache");
    ctx.response.headers.set("Connection", "keep-alive");
    ctx.response.headers.set("X-Accel-Buffering", "no");

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (event: any) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          } catch { /* stream closed */ }
        };

        sendEvent({ type: "batch_start", message: `Starting batch run for ${models.length} models`, data: { batchId, models } });

        // Run all models in parallel
        const runPromises = models.map(async (model: string) => {
          const startTime = Date.now();
          try {
            sendEvent({ type: "model_start", message: `Starting ${model}`, data: { model } });

            const result = await RepoTestService.run(
              { repo_url, ref, prompt, test_command, tool, model },
              (progress) => {
                sendEvent({
                  type: "model_progress",
                  message: progress.message,
                  data: { model, ...progress }
                });
              }
            );

            sendEvent({
              type: "model_complete",
              message: `${model}: ${result.status} (${result.final_tests_passed}/${result.final_tests_total})`,
              data: { model, result, duration_ms: Date.now() - startTime }
            });

            return { model, result, error: null, duration_ms: Date.now() - startTime };
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            sendEvent({
              type: "model_error",
              message: `${model} failed: ${errorMsg}`,
              data: { model, error: errorMsg }
            });
            return { model, result: null, error: errorMsg, duration_ms: Date.now() - startTime };
          }
        });

        const results = await Promise.all(runPromises);

        // Build leaderboard
        const leaderboard = results.map(r => ({
          model: r.model,
          status: r.result?.status || 'error',
          tests_passed: r.result?.final_tests_passed || 0,
          tests_total: r.result?.final_tests_total || 0,
          tests_failed: r.result?.final_tests_failed || 0,
          duration_ms: r.duration_ms,
          iterations: r.result?.iterations.length || 0,
          error: r.error,
        })).sort((a, b) => {
          // Sort by: pass rate descending, then tests passed descending
          if (a.status === 'success' && b.status !== 'success') return -1;
          if (b.status === 'success' && a.status !== 'success') return 1;
          const aRate = a.tests_total > 0 ? a.tests_passed / a.tests_total : 0;
          const bRate = b.tests_total > 0 ? b.tests_passed / b.tests_total : 0;
          if (bRate !== aRate) return bRate - aRate;
          return b.tests_passed - a.tests_passed;
        });

        sendEvent({
          type: "batch_complete",
          message: `Batch complete: ${results.filter(r => r.result?.status === 'success').length}/${models.length} models passed`,
          data: { batchId, leaderboard, results }
        });

        try {
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch { /* ignore */ }
      },
    });

    ctx.response.body = stream;
  } catch (error) {
    ctx.response.status = 500;
    ctx.response.body = { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
});

export default router;
