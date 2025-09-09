import { Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { OpenRouterService } from "../services/openRouterService.ts";
import { DbService } from "../services/dbService.ts";

const router = new Router({
  prefix: "/api/openrouter"
});

// Get all available models
router.get("/models", async (ctx) => {
  try {
    // Get the API key from the database
    const apiKeyRecord = DbService.getApiKey("OPENROUTER_API_KEY", "OpenRouter");
    
    if (!apiKeyRecord) {
      ctx.response.status = 404;
      ctx.response.body = { error: "OpenRouter API key not found" };
      return;
    }

    const service = new OpenRouterService(apiKeyRecord.key_value);
    const models = await service.getModels();
    
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

// Test OpenRouter connection
router.post("/test-connection", async (ctx) => {
  try {
    const { apiKey } = await ctx.request.body.json();
    
    if (!apiKey) {
      ctx.response.status = 400;
      ctx.response.body = { error: "API key is required" };
      return;
    }

    const isConnected = await OpenRouterService.testConnection(apiKey);
    
    ctx.response.body = {
      success: true,
      data: { connected: isConnected },
    };
  } catch (error) {
    console.error("Error testing connection:", error);
    ctx.response.status = 500;
    ctx.response.body = {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
});

// Generate completion
router.post("/generate", async (ctx) => {
  try {
    const { prompt, model, temperature = 0.7, max_tokens = 1000 } = await ctx.request.body.json();
    
    if (!prompt || !model) {
      ctx.response.status = 400;
      ctx.response.body = { error: "Prompt and model are required" };
      return;
    }

    // Get the API key from the database
    const apiKeyRecord = DbService.getApiKey("OPENROUTER_API_KEY", "OpenRouter");
    
    if (!apiKeyRecord) {
      ctx.response.status = 404;
      ctx.response.body = { error: "OpenRouter API key not found" };
      return;
    }

    const service = new OpenRouterService(apiKeyRecord.key_value);
    
    const request = {
      model,
      messages: [
        { role: "user", content: prompt },
      ],
      temperature,
      max_tokens,
    };

    const result = await service.generateCompletion(request, model);
    
    if (result.error) {
      ctx.response.status = 500;
      ctx.response.body = {
        success: false,
        error: result.error,
        responseTime: result.responseTime,
      };
      return;
    }

    ctx.response.body = {
      success: true,
      data: {
        response: result.response,
        responseTime: result.responseTime,
      },
    };
  } catch (error) {
    console.error("Error generating completion:", error);
    ctx.response.status = 500;
    ctx.response.body = {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
});

// Save API key
router.post("/api-key", async (ctx) => {
  try {
    const { apiKey } = await ctx.request.body.json();
    
    if (!apiKey) {
      ctx.response.status = 400;
      ctx.response.body = { error: "API key is required" };
      return;
    }

    // Check if API key already exists
    const existingKey = DbService.getApiKey("OPENROUTER_API_KEY", "OpenRouter");
    
    if (existingKey) {
      // Update existing key
      DbService.updateApiKey(existingKey.id!, { key_value: apiKey });
    } else {
      // Create new key
      DbService.createApiKey({
        provider: "OpenRouter",
        key_name: "OPENROUTER_API_KEY",
        key_value: apiKey,
      });
    }

    ctx.response.body = {
      success: true,
      message: "API key saved successfully",
    };
  } catch (error) {
    console.error("Error saving API key:", error);
    ctx.response.status = 500;
    ctx.response.body = {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
});

// Get API key status
router.get("/api-key/status", async (ctx) => {
  try {
    const apiKeyRecord = DbService.getApiKey("OPENROUTER_API_KEY", "OpenRouter");
    
    ctx.response.body = {
      success: true,
      data: {
        hasApiKey: !!apiKeyRecord,
      },
    };
  } catch (error) {
    console.error("Error checking API key status:", error);
    ctx.response.status = 500;
    ctx.response.body = {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
});

export default router;