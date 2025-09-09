import { OpenRouterService, StreamChunk } from "./openRouterService.ts";
import { DbService } from "./dbService.ts";

export interface SpeedTestRequest {
  prompt: string;
  models: string[];
  temperature?: number;
  max_tokens?: number;
}

export interface SpeedTestResult {
  model: string;
  responseTime: number;
  response: any;
  error: string | null;
}

export interface SpeedTestComparison {
  prompt: string;
  results: SpeedTestResult[];
  startTime: number;
  endTime: number;
  totalTime: number;
}

export interface StreamingEvent {
  type: 'start' | 'chunk' | 'complete' | 'error' | 'metrics';
  model?: string;
  content?: string;
  reasoningContent?: string;
  error?: string;
  latency?: number;
  tokensPerSecond?: number;
  totalTokens?: number;
  reasoningTokens?: number;
  firstTokenTime?: number;
}

export class SpeedTestService {
  static async runSpeedTest(request: SpeedTestRequest): Promise<SpeedTestComparison> {
    const startTime = Date.now();
    const results: SpeedTestResult[] = [];

    // Get the API key from the database
    const apiKeyRecord = DbService.getApiKey("OPENROUTER_API_KEY", "OpenRouter");
    
    if (!apiKeyRecord) {
      throw new Error("OpenRouter API key not found. Please configure your API key in the settings.");
    }

    if (!apiKeyRecord.key_value || 
        apiKeyRecord.key_value === "your_openrouter_api_key_here" || 
        apiKeyRecord.key_value.trim() === "" ||
        (!apiKeyRecord.key_value.startsWith("sk-or-") && !apiKeyRecord.key_value.startsWith("sk-"))) {
      throw new Error("Invalid OpenRouter API key. Please update your API key in the settings with a valid key from https://openrouter.ai/keys. Expected format: sk-or-... or sk-...");
    }

    const service = new OpenRouterService(apiKeyRecord.key_value);

    // Run all requests in parallel
    const promises = request.models.map(async (model) => {
      try {
        const openRouterRequest = {
          model,
          messages: [
            { role: "user" as const, content: request.prompt },
          ],
          temperature: request.temperature || 0.7,
          max_tokens: request.max_tokens || 1000,
        };

        const result = await service.generateCompletion(openRouterRequest, model);
        
        return {
          model,
          responseTime: result.responseTime,
          response: result.response,
          error: result.error,
        };
      } catch (error) {
        return {
          model,
          responseTime: 0,
          response: null,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    });

    // Wait for all requests to complete
    const testResults = await Promise.all(promises);
    results.push(...testResults);

    const endTime = Date.now();
    const totalTime = endTime - startTime;

    // Store the comparison results in the database
    for (const result of results) {
      DbService.createTestResult({
        prompt: request.prompt,
        provider: "OpenRouter",
        model: result.model,
        response_time: result.responseTime,
        response_text: result.response?.choices?.[0]?.message?.content || "",
        status: result.error ? `error: ${result.error}` : "completed"
      });
    }

    return {
      prompt: request.prompt,
      results,
      startTime,
      endTime,
      totalTime,
    };
  }

  static async getTestHistory(limit = 20): Promise<any[]> {
    return DbService.getTestResults(limit);
  }

  static async getAvailableModels(): Promise<any[]> {
    // Get the API key from the database
    const apiKeyRecord = DbService.getApiKey("OPENROUTER_API_KEY", "OpenRouter");
    
    if (!apiKeyRecord) {
      throw new Error("OpenRouter API key not found. Please configure your API key in the settings.");
    }

    if (!apiKeyRecord.key_value || 
        apiKeyRecord.key_value === "your_openrouter_api_key_here" || 
        apiKeyRecord.key_value.trim() === "" ||
        (!apiKeyRecord.key_value.startsWith("sk-or-") && !apiKeyRecord.key_value.startsWith("sk-"))) {
      throw new Error("Invalid OpenRouter API key. Please update your API key in the settings with a valid key from https://openrouter.ai/keys. Expected format: sk-or-... or sk-...");
    }

    const service = new OpenRouterService(apiKeyRecord.key_value);
    return await service.getModels();
  }

  static async getPopularModels(): Promise<string[]> {
    try {
      // First, try to get saved models from LLM Management
      const savedModels = DbService.getLLMModels();
      const providers = DbService.getLLMProviders();
      const providerMap = new Map(providers.map(p => [p.id, p.name]));
      
      const activeModels = savedModels
        .filter(model => model.is_active)
        .map(model => {
          const providerName = providerMap.get(model.provider_id) || 'unknown';
          return `${providerName}/${model.model_id}`;
        });
      
      if (activeModels.length > 0) {
        return activeModels;
      }
      
      // Fallback to hardcoded popular models if no saved models
      const popularModelIds = [
        "z-ai/glm-4.5",
        "z-ai/glm-4.5-air",
        "deepseek/deepseek-chat-v3.1",
        "moonshotai/kimi-k2",
        "qwen/qwen3-coder"
      ];

      const models = await this.getAvailableModels();
      const available = new Set((models || []).map((m: any) => m.id));
      const filtered = popularModelIds.filter((id) => available.has(id));
      return filtered.length > 0 ? filtered : popularModelIds;
    } catch (error) {
      console.error("Error getting popular models:", error);
      // On error, return hardcoded fallback
      return [
        "z-ai/glm-4.5",
        "z-ai/glm-4.5-air",
        "deepseek/deepseek-chat-v3.1",
        "moonshotai/kimi-k2",
        "qwen/qwen3-coder"
      ];
    }
  }

  static async runStreamingSpeedTest(
    request: SpeedTestRequest, 
    onEvent: (event: StreamingEvent) => void
  ): Promise<void> {
    const apiKeyRecord = DbService.getApiKey("OPENROUTER_API_KEY", "OpenRouter");
    
    if (!apiKeyRecord || !apiKeyRecord.key_value || 
        apiKeyRecord.key_value === "your_openrouter_api_key_here" || 
        apiKeyRecord.key_value.trim() === "" ||
        (!apiKeyRecord.key_value.startsWith("sk-or-") && !apiKeyRecord.key_value.startsWith("sk-"))) {
      onEvent({
        type: 'error',
        error: "Invalid OpenRouter API key. Please update your API key."
      });
      return;
    }

    const service = new OpenRouterService(apiKeyRecord.key_value);
    
    // Process models in parallel
    const promises = request.models.map(async (model) => {
      const startTime = Date.now();
      let firstTokenTime: number | null = null;
      let tokenCount = 0;
      let content = "";
      let reasoningContent = "";
      
      onEvent({
        type: 'start',
        model
      });
      
      try {
        // Strip openrouter prefix if present (openrouter/provider/model -> provider/model)
        const actualModel = model.startsWith('openrouter/') ? model.slice(11) : model;
        
        const openRouterRequest = {
          model: actualModel,
          messages: [{ role: "user" as const, content: request.prompt }],
          temperature: request.temperature || 0.7,
          max_tokens: request.max_tokens || 1000,
        };

        await service.generateStreamingCompletion(
          openRouterRequest,
          model,
          (chunk: StreamChunk) => {
            const now = Date.now();
            
            // Track first token time
            if (firstTokenTime === null && (chunk.choices?.[0]?.delta?.content || chunk.choices?.[0]?.delta?.reasoning_content)) {
              firstTokenTime = now;
              const latency = now - startTime;
              
              onEvent({
                type: 'metrics',
                model,
                latency,
                firstTokenTime: latency
              });
            }
            
            // Process content chunks
            if (chunk.choices?.[0]?.delta?.content) {
              content += chunk.choices[0].delta.content;
              tokenCount++;
              
              onEvent({
                type: 'chunk',
                model,
                content: chunk.choices[0].delta.content
              });
            }
            
            // Process reasoning chunks
            if (chunk.choices?.[0]?.delta?.reasoning_content) {
              reasoningContent += chunk.choices[0].delta.reasoning_content;
              
              onEvent({
                type: 'chunk',
                model,
                reasoningContent: chunk.choices[0].delta.reasoning_content
              });
            }
            
            // Calculate tokens per second
            if (firstTokenTime && tokenCount > 0) {
              const elapsed = (now - firstTokenTime) / 1000;
              const tokensPerSecond = elapsed > 0 ? tokenCount / elapsed : 0;
              
              onEvent({
                type: 'metrics',
                model,
                tokensPerSecond,
                totalTokens: tokenCount
              });
            }
          }
        );
        
        onEvent({
          type: 'complete',
          model
        });
        
      } catch (error) {
        onEvent({
          type: 'error',
          model,
          error: error instanceof Error ? error.message : "Unknown error"
        });
      }
    });
    
    await Promise.all(promises);
  }
}