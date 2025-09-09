import { Application } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { oakCors } from "https://deno.land/x/cors@v1.2.2/mod.ts";
import openRouterRoutes from "./routes/openRouter.ts";
import speedTestRoutes from "./routes/speedTest.ts";
import { saveRunHistory, getRunHistory, getRunStats } from "./routes/runHistory.ts";
import { LLMManagementHandler } from "./routes/llmManagement.ts";
import { DbService } from "./services/dbService.ts";

const app = new Application();

// Enable CORS for all routes
app.use(oakCors());

// Logger middleware
app.use(async (ctx, next) => {
  await next();
  const rt = ctx.response.headers.get("X-Response-Time");
  console.log(`${ctx.request.method} ${ctx.request.url} - ${rt}`);
});

// Timing middleware
app.use(async (ctx, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  ctx.response.headers.set("X-Response-Time", `${ms}ms`);
});

// Root route
app.use((ctx, next) => {
  if (ctx.request.url.pathname === "/") {
    ctx.response.body = {
      message: "Welcome to LLM Speed Test API",
      version: "1.0.0",
    };
    return;
  }
  return next();
});

// Health check route
app.use((ctx, next) => {
  if (ctx.request.url.pathname === "/health") {
    ctx.response.body = {
      status: "healthy",
      timestamp: new Date().toISOString(),
    };
    return;
  }
  return next();
});

// Test results route
app.use((ctx, next) => {
  if (ctx.request.url.pathname === "/api/test-results" && ctx.request.method === "GET") {
    try {
      const limit = parseInt(ctx.request.url.searchParams.get("limit") || "50");
      const results = DbService.getTestResults(limit);
      ctx.response.body = {
        success: true,
        data: results,
      };
      return;
    } catch (error) {
      console.error("Error fetching test results:", error);
      ctx.response.status = 500;
      ctx.response.body = {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
      return;
    }
  }
  return next();
});

// Run history routes
app.use(async (ctx, next) => {
  if (ctx.request.url.pathname === "/api/run-history" && ctx.request.method === "POST") {
    const response = await saveRunHistory(ctx.request);
    ctx.response.status = response.status;
    ctx.response.body = await response.json();
    return;
  }
  if (ctx.request.url.pathname === "/api/run-history" && ctx.request.method === "GET") {
    const response = await getRunHistory(ctx.request);
    ctx.response.status = response.status;
    ctx.response.body = await response.json();
    return;
  }
  if (ctx.request.url.pathname === "/api/run-stats" && ctx.request.method === "GET") {
    const response = await getRunStats(ctx.request);
    ctx.response.status = response.status;
    ctx.response.body = await response.json();
    return;
  }
  return next();
});

// LLM Management routes
app.use(async (ctx, next) => {
  const path = ctx.request.url.pathname;
  const method = ctx.request.method;

  // LLM Providers
  if (path === "/api/llm/providers" && method === "GET") {
    try {
      const result = await LLMManagementHandler.getProviders();
      ctx.response.body = result;
      return;
    } catch (error) {
      ctx.response.status = 500;
      ctx.response.body = { error: error instanceof Error ? error.message : "Unknown error" };
      return;
    }
  }

  // LLM Provider by name
  if (path.startsWith("/api/llm/providers/") && !path.includes("/models") && method === "GET") {
    try {
      const name = path.split("/")[4];
      const result = await LLMManagementHandler.getProvider(name);
      ctx.response.body = result;
      return;
    } catch (error) {
      ctx.response.status = 500;
      ctx.response.body = { error: error instanceof Error ? error.message : "Unknown error" };
      return;
    }
  }

  // Provider models
  if (path.match(/^\/api\/llm\/providers\/[^\/]+\/models$/) && (method === "GET" || method === "POST")) {
    try {
      const name = path.split("/")[4];
      let apiKey: string | undefined;
      
      if (method === "GET") {
        apiKey = ctx.request.url.searchParams.get("apiKey") || undefined;
      } else {
        const body = await ctx.request.body({ type: "json" }).value;
        apiKey = body.apiKey;
      }
      
      const result = await LLMManagementHandler.fetchProviderModels(name, apiKey);
      ctx.response.body = result;
      return;
    } catch (error) {
      ctx.response.status = 500;
      ctx.response.body = { error: error instanceof Error ? error.message : "Unknown error" };
      return;
    }
  }

  // LLM Models
  if (path === "/api/llm/models" && method === "GET") {
    try {
      const providerId = ctx.request.url.searchParams.get("providerId");
      const result = await LLMManagementHandler.getModels(providerId ? parseInt(providerId) : undefined);
      ctx.response.body = result;
      return;
    } catch (error) {
      ctx.response.status = 500;
      ctx.response.body = { error: error instanceof Error ? error.message : "Unknown error" };
      return;
    }
  }

  if (path === "/api/llm/models" && method === "POST") {
    try {
      const body = await ctx.request.body({ type: "json" }).value;
      const result = await LLMManagementHandler.createModel(body);
      ctx.response.body = result;
      return;
    } catch (error) {
      ctx.response.status = 500;
      ctx.response.body = { error: error instanceof Error ? error.message : "Unknown error" };
      return;
    }
  }

  // LLM Model by ID
  if (path.match(/^\/api\/llm\/models\/\d+$/) && method === "GET") {
    try {
      const id = parseInt(path.split("/")[4]);
      const result = await LLMManagementHandler.getModel(id);
      ctx.response.body = result;
      return;
    } catch (error) {
      ctx.response.status = 500;
      ctx.response.body = { error: error instanceof Error ? error.message : "Unknown error" };
      return;
    }
  }

  if (path.match(/^\/api\/llm\/models\/\d+$/) && method === "PUT") {
    try {
      const id = parseInt(path.split("/")[4]);
      const body = await ctx.request.body({ type: "json" }).value;
      const result = await LLMManagementHandler.updateModel(id, body);
      ctx.response.body = result;
      return;
    } catch (error) {
      ctx.response.status = 500;
      ctx.response.body = { error: error instanceof Error ? error.message : "Unknown error" };
      return;
    }
  }

  if (path.match(/^\/api\/llm\/models\/\d+$/) && method === "DELETE") {
    try {
      const id = parseInt(path.split("/")[4]);
      const result = await LLMManagementHandler.deleteModel(id);
      ctx.response.body = result;
      return;
    } catch (error) {
      ctx.response.status = 500;
      ctx.response.body = { error: error instanceof Error ? error.message : "Unknown error" };
      return;
    }
  }

  return next();
});

// API routes
app.use(openRouterRoutes.routes());
app.use(openRouterRoutes.allowedMethods());

app.use(speedTestRoutes.routes());
app.use(speedTestRoutes.allowedMethods());

// Start the server
const port = parseInt(Deno.env.get("PORT") || "8000");
console.log(`Server running on http://localhost:${port}`);
await app.listen({ port });