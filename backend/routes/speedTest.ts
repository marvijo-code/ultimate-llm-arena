import { Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { SpeedTestService, type StreamingEvent } from "../services/speedTestService.ts";

const router = new Router({
  prefix: "/api/speed-test"
});

// Run speed test with streaming
router.post("/run-stream", async (ctx) => {
  try {
    const { prompt, models, temperature = 0.7, max_tokens = 1000 } = await ctx.request.body().value;
    
    if (!prompt || !models || !Array.isArray(models) || models.length === 0) {
      ctx.response.status = 400;
      ctx.response.body = { 
        success: false, 
        error: "Prompt and at least one model are required" 
      };
      return;
    }

    // Set up Server-Sent Events
    ctx.response.headers.set("Content-Type", "text/event-stream");
    ctx.response.headers.set("Cache-Control", "no-cache");
    ctx.response.headers.set("Connection", "keep-alive");
    ctx.response.headers.set("Access-Control-Allow-Origin", "*");
    ctx.response.headers.set("Access-Control-Allow-Headers", "Cache-Control");

    let closeStream: (() => void) | undefined;
    const body = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        let streamClosed = false;
        const cleanupCallbacks: Array<() => void> = [];

        const closeIfNeeded = () => {
          if (streamClosed) {
            return;
          }
          streamClosed = true;
          try {
            controller.close();
          } catch (closeError) {
            console.error("Failed to close SSE stream:", closeError);
          }
          cleanupCallbacks.forEach((cleanup) => cleanup());
        };

        closeStream = closeIfNeeded;

        const sendEvent = (event: StreamingEvent | { type: string; [key: string]: unknown }) => {
          if (streamClosed) {
            return;
          }
          try {
            const data = `data: ${JSON.stringify(event)}\n\n`;
            controller.enqueue(encoder.encode(data));
          } catch (enqueueError) {
            console.error("Failed to enqueue SSE event:", enqueueError);
            closeIfNeeded();
          }
        };

        const requestSignal = (ctx.request as { signal?: AbortSignal; originalRequest?: Request }).signal ??
          (ctx.request as { originalRequest?: Request }).originalRequest?.signal;

        if (requestSignal) {
          const abortHandler = () => {
            closeIfNeeded();
          };

          requestSignal.addEventListener("abort", abortHandler);
          cleanupCallbacks.push(() => requestSignal.removeEventListener("abort", abortHandler));
        }

        SpeedTestService.runStreamingSpeedTest({
          prompt,
          models,
          temperature,
          max_tokens,
        }, (event) => {
          sendEvent(event);
        }).then(() => {
          closeIfNeeded();
        }).catch((error) => {
          sendEvent({
            type: "error",
            error: error instanceof Error ? error.message : "Unknown error",
          });
          closeIfNeeded();
        });
      },
      cancel() {
        if (closeStream) {
          closeStream();
        }
      },
    });

    ctx.response.body = body;
  } catch (error) {
    console.error("Error running streaming speed test:", error);
    ctx.response.status = 500;
    ctx.response.body = {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
});

// Run speed test (non-streaming for compatibility)
router.post("/run", async (ctx) => {
  try {
    const { prompt, models, temperature = 0.7, max_tokens = 1000 } = await ctx.request.body().value;
    
    if (!prompt || !models || !Array.isArray(models) || models.length === 0) {
      ctx.response.status = 400;
      ctx.response.body = { 
        success: false, 
        error: "Prompt and at least one model are required" 
      };
      return;
    }

    const result = await SpeedTestService.runSpeedTest({
      prompt,
      models,
      temperature,
      max_tokens,
    });
    
    ctx.response.body = {
      success: true,
      data: result,
    };
  } catch (error) {
    console.error("Error running speed test:", error);
    ctx.response.status = 500;
    ctx.response.body = {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
});

// Get test history
router.get("/history", async (ctx) => {
  try {
    const limit = parseInt(ctx.request.url.searchParams.get("limit") || "20");
    const history = await SpeedTestService.getTestHistory(limit);
    
    ctx.response.body = {
      success: true,
      data: history,
    };
  } catch (error) {
    console.error("Error fetching test history:", error);
    ctx.response.status = 500;
    ctx.response.body = {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
});

// Get available models
router.get("/models", async (ctx) => {
  try {
    const models = await SpeedTestService.getAvailableModels();
    
    ctx.response.body = {
      success: true,
      data: models,
    };
  } catch (error) {
    console.error("Error fetching models:", error);
    ctx.response.status = 500;
    ctx.response.body = {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
});

// Get popular models
router.get("/popular-models", async (ctx) => {
  try {
    const models = await SpeedTestService.getPopularModels();
    
    ctx.response.body = {
      success: true,
      data: models,
    };
  } catch (error) {
    console.error("Error fetching popular models:", error);
    ctx.response.status = 500;
    ctx.response.body = {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
});

export default router;