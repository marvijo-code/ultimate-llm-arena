import { Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { RepoTestService } from "../services/repoTestService.ts";

const router = new Router({ prefix: "/api/repo-test" });

// List available coding tools
router.get("/tools", (ctx) => {
  try {
    const tools = RepoTestService.listTools();
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

export default router;
