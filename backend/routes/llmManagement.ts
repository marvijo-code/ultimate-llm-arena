import { DbService } from "../services/dbService.ts";
import type { LLMProvider, LLMModel } from "../db.ts";

export interface LLMManagementRoutes {
  "/api/llm/providers": {
    GET: () => Promise<{ providers: LLMProvider[] }>;
  };
  "/api/llm/providers/:name": {
    GET: (params: { name: string }) => Promise<{ provider: LLMProvider | null }>;
  };
  "/api/llm/providers/:name/models": {
    GET: (params: { name: string }) => Promise<{ models: any[] }>;
    POST: (params: { name: string }, body: { apiKey?: string }) => Promise<{ models: any[] }>;
  };
  "/api/llm/models": {
    GET: (query?: { providerId?: string }) => Promise<{ models: LLMModel[] }>;
    POST: (body: Omit<LLMModel, "id" | "created_at">) => Promise<{ id: number; model: LLMModel }>;
  };
  "/api/llm/models/:id": {
    GET: (params: { id: string }) => Promise<{ model: LLMModel | null }>;
    PUT: (params: { id: string }, body: Partial<LLMModel>) => Promise<{ success: boolean }>;
    DELETE: (params: { id: string }) => Promise<{ success: boolean }>;
  };
}

// Provider model fetching configurations
const PROVIDER_CONFIGS = {
  openrouter: {
    modelsEndpoint: "https://openrouter.ai/api/v1/models",
    authHeader: (apiKey: string) => ({ "Authorization": `Bearer ${apiKey}` }),
    parseModels: (data: any) => data.data || []
  },
  openai: {
    modelsEndpoint: "https://api.openai.com/v1/models",
    authHeader: (apiKey: string) => ({ "Authorization": `Bearer ${apiKey}` }),
    parseModels: (data: any) => data.data || []
  },
  anthropic: {
    modelsEndpoint: null, // Anthropic doesn't have a public models endpoint
    authHeader: (apiKey: string) => ({ "x-api-key": apiKey }),
    parseModels: (_data?: any) => [
      { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet" },
      { id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku" },
      { id: "claude-3-opus-20240229", name: "Claude 3 Opus" }
    ]
  },
  google: {
    modelsEndpoint: null, // Google uses different API structure
    authHeader: (apiKey: string) => ({ "Authorization": `Bearer ${apiKey}` }),
    parseModels: () => [
      { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro" },
      { id: "gemini-1.5-flash", name: "Gemini 1.5 Flash" },
      { id: "gemini-1.0-pro", name: "Gemini 1.0 Pro" }
    ]
  },
  deepseek: {
    modelsEndpoint: "https://api.deepseek.com/v1/models",
    authHeader: (apiKey: string) => ({ "Authorization": `Bearer ${apiKey}` }),
    parseModels: (data: any) => data.data || []
  },
  xai: {
    modelsEndpoint: "https://api.x.ai/v1/models",
    authHeader: (apiKey: string) => ({ "Authorization": `Bearer ${apiKey}` }),
    parseModels: (data: any) => data.data || []
  }
};

export class LLMManagementHandler {
  // Get all LLM providers
  static async getProviders(): Promise<{ providers: LLMProvider[] }> {
    const providers = DbService.getLLMProviders();
    return { providers };
  }

  // Get specific provider
  static async getProvider(name: string): Promise<{ provider: LLMProvider | null }> {
    const provider = DbService.getLLMProvider(name);
    return { provider: provider || null };
  }

  // Fetch models from provider API
  static async fetchProviderModels(providerName: string, apiKey?: string): Promise<{ models: any[] }> {
    const normalized = providerName.toLowerCase();
    const config = PROVIDER_CONFIGS[normalized as keyof typeof PROVIDER_CONFIGS];

    if (!config) {
      throw new Error(`Unsupported provider: ${providerName}`);
    }

    // For providers without public endpoints, return predefined models
    if (!config.modelsEndpoint) {
      const models = config.parseModels(undefined as any);
      return { models };
    }

    // Special case: OpenRouter models endpoint is public; allow no API key
    if (normalized === "openrouter" && !apiKey) {
      try {
        const response = await fetch(config.modelsEndpoint, {
          method: "GET",
          headers: { "Content-Type": "application/json" }
        });
        if (response.ok) {
          const data = await response.json();
          const models = config.parseModels(data);
          return { models };
        }
        // If OpenRouter ever requires a key, fall through to key-required path
      } catch (e) {
        console.error("Error fetching OpenRouter models without API key:", e);
        // Fall through
      }
    }

    if (!apiKey) {
      throw new Error("API key required for this provider");
    }

    try {
      const response = await fetch(config.modelsEndpoint, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          ...config.authHeader(apiKey)
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const models = config.parseModels(data);

      return { models };
    } catch (error) {
      console.error(`Error fetching models for ${providerName}:`, error);
      throw error;
    }
  }

  // Get stored models
  static async getModels(providerId?: number): Promise<{ models: LLMModel[] }> {
    const models = DbService.getLLMModels(providerId);
    return { models };
  }

  // Add model to database
  static async createModel(modelData: Omit<LLMModel, "id" | "created_at">): Promise<{ id: number; model: LLMModel }> {
    const id = DbService.createLLMModel(modelData);
    const model = DbService.getLLMModel(id);
    
    if (!model) {
      throw new Error("Failed to create model");
    }
    
    return { id, model };
  }

  // Get specific model
  static async getModel(id: number): Promise<{ model: LLMModel | null }> {
    const model = DbService.getLLMModel(id);
    return { model: model || null };
  }

  // Update model
  static async updateModel(id: number, updates: Partial<LLMModel>): Promise<{ success: boolean }> {
    const success = DbService.updateLLMModel(id, updates);
    return { success };
  }

  // Delete model
  static async deleteModel(id: number): Promise<{ success: boolean }> {
    const success = DbService.deleteLLMModel(id);
    return { success };
  }
}

// Route handlers for Deno server
export const llmRoutes = {
  "/api/llm/providers": {
    GET: async () => {
      try {
        return new Response(JSON.stringify(await LLMManagementHandler.getProviders()), {
          headers: { "Content-Type": "application/json" }
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
    }
  },

  "/api/llm/providers/:name": {
    GET: async (request: Request, params: { name: string }) => {
      try {
        return new Response(JSON.stringify(await LLMManagementHandler.getProvider(params.name)), {
          headers: { "Content-Type": "application/json" }
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
    }
  },

  "/api/llm/providers/:name/models": {
    GET: async (request: Request, params: { name: string }) => {
      try {
        const url = new URL(request.url);
        const apiKey = url.searchParams.get("apiKey") || undefined;
        
        return new Response(JSON.stringify(await LLMManagementHandler.fetchProviderModels(params.name, apiKey)), {
          headers: { "Content-Type": "application/json" }
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
    },

    POST: async (request: Request, params: { name: string }) => {
      try {
        const body = await request.json();
        const apiKey = body.apiKey;
        
        return new Response(JSON.stringify(await LLMManagementHandler.fetchProviderModels(params.name, apiKey)), {
          headers: { "Content-Type": "application/json" }
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
    }
  },

  "/api/llm/models": {
    GET: async (request: Request) => {
      try {
        const url = new URL(request.url);
        const providerId = url.searchParams.get("providerId");
        
        return new Response(JSON.stringify(await LLMManagementHandler.getModels(
          providerId ? parseInt(providerId) : undefined
        )), {
          headers: { "Content-Type": "application/json" }
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
    },

    POST: async (request: Request) => {
      try {
        const body = await request.json();
        return new Response(JSON.stringify(await LLMManagementHandler.createModel(body)), {
          headers: { "Content-Type": "application/json" }
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
    }
  },

  "/api/llm/models/:id": {
    GET: async (request: Request, params: { id: string }) => {
      try {
        const id = parseInt(params.id);
        return new Response(JSON.stringify(await LLMManagementHandler.getModel(id)), {
          headers: { "Content-Type": "application/json" }
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
    },

    PUT: async (request: Request, params: { id: string }) => {
      try {
        const id = parseInt(params.id);
        const body = await request.json();
        return new Response(JSON.stringify(await LLMManagementHandler.updateModel(id, body)), {
          headers: { "Content-Type": "application/json" }
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
    },

    DELETE: async (request: Request, params: { id: string }) => {
      try {
        const id = parseInt(params.id);
        return new Response(JSON.stringify(await LLMManagementHandler.deleteModel(id)), {
          headers: { "Content-Type": "application/json" }
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
    }
  }
};
