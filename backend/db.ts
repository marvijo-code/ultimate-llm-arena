// Simple in-memory database with basic persistence
interface DatabaseRow {
  [key: string]: any;
}

interface RunHistory {
  id: number;
  prompt: string;
  models: string[];
  results: {
    model: string;
    content: string;
    reasoningContent?: string;
    responseTime?: number;
    tokens?: number;
    reasoningTokens?: number;
    latency?: number;
    tokensPerSecond?: number;
    firstTokenTime?: number;
    error?: string;
  }[];
  created_at: string;
}

interface RunStats {
  model: string;
  avgResponseTime: number;
  avgTokensPerSecond: number;
  avgLatency: number;
  totalRuns: number;
  successRate: number;
  avgTokens: number;
  avgReasoningTokens: number;
}

interface LLMProvider {
  id: number;
  name: string;
  display_name: string;
  base_url: string;
  api_key_required: boolean;
  is_active: boolean;
  created_at: string;
}

interface LLMModel {
  id: number;
  provider_id: number;
  model_id: string;
  display_name: string;
  description?: string;
  context_length?: number;
  max_output_tokens?: number;
  input_cost_per_token?: number;
  output_cost_per_token?: number;
  supports_streaming: boolean;
  supports_reasoning: boolean;
  is_active: boolean;
  created_at: string;
}

interface CodeEvalResult {
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

interface CodeEvalRun {
  id: number;
  exerciseId: string;
  exerciseName: string;
  testCount: number;
  models: string[];
  results: CodeEvalResult[];
  created_at: string;
}


class InMemoryDB {
  private apiKeys: any[] = [];
  private testResults: any[] = [];
  private runHistory: RunHistory[] = [];
  private codeEvalRuns: CodeEvalRun[] = [];
  private providers: any[] = [
    {
      id: 1,
      name: "OpenRouter",
      base_url: "https://openrouter.ai/api/v1",
      is_active: true,
      created_at: new Date().toISOString()
    }
  ];
  private llmProviders: LLMProvider[] = [
    {
      id: 1,
      name: "openrouter",
      display_name: "OpenRouter",
      base_url: "https://openrouter.ai/api/v1",
      api_key_required: true,
      is_active: true,
      created_at: new Date().toISOString()
    },
    {
      id: 2,
      name: "openai",
      display_name: "OpenAI",
      base_url: "https://api.openai.com/v1",
      api_key_required: true,
      is_active: true,
      created_at: new Date().toISOString()
    },
    {
      id: 3,
      name: "anthropic",
      display_name: "Anthropic",
      base_url: "https://api.anthropic.com/v1",
      api_key_required: true,
      is_active: true,
      created_at: new Date().toISOString()
    },
    {
      id: 4,
      name: "google",
      display_name: "Google",
      base_url: "https://generativelanguage.googleapis.com/v1",
      api_key_required: true,
      is_active: true,
      created_at: new Date().toISOString()
    },
    {
      id: 5,
      name: "deepseek",
      display_name: "DeepSeek",
      base_url: "https://api.deepseek.com/v1",
      api_key_required: true,
      is_active: true,
      created_at: new Date().toISOString()
    },
    {
      id: 6,
      name: "xai",
      display_name: "xAI",
      base_url: "https://api.x.ai/v1",
      api_key_required: true,
      is_active: true,
      created_at: new Date().toISOString()
    }
  ];
  private llmModels: LLMModel[] = [];
  private nextId = {
    apiKeys: 1,
    testResults: 1,
    providers: 2,
    runHistory: 1,
    codeEvalRuns: 1,
    llmProviders: 7,
    llmModels: 1
  };

  constructor() {
    this.init();
  }

  private init() {
    // Initialize with API key from environment or .env file
    if (this.apiKeys.length === 0) {
      let apiKey = this.loadApiKeyFromEnv();

      this.apiKeys.push({
        id: this.nextId.apiKeys++,
        provider: "OpenRouter",
        key_name: "OPENROUTER_API_KEY",
        key_value: apiKey,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    }
  }

  private loadApiKeyFromEnv(): string {
    let apiKey = "";

    try {
      // Try to load from .env file first
      const envPaths = ['.env.local', '.env'];

      for (const envPath of envPaths) {
        try {
          let envContent: string | null = null;

          // Deno environment
          if (typeof (globalThis as any).Deno !== 'undefined') {
            try {
              // @ts-ignore
              envContent = (globalThis as any).Deno.readTextFileSync(envPath) as string;
            } catch {
              continue; // File doesn't exist
            }
          } else {
            // Node.js environment
            try {
              const fs = (globalThis as any).require?.('fs');
              if (fs && fs.existsSync && fs.readFileSync) {
                if (fs.existsSync(envPath)) {
                  envContent = fs.readFileSync(envPath, 'utf8') as string;
                }
              }
            } catch {
              continue; // File doesn't exist or fs not available
            }
          }

          if (envContent) {
            const lines = envContent.split('\n');
            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed.startsWith('OPENROUTER_API_KEY=')) {
                const value = trimmed.substring('OPENROUTER_API_KEY='.length);
                return value.trim().replace(/^["']|["']$/g, '');
              }
            }
          }
        } catch {
          // Continue to next file
        }
      }

      // Fallback to environment variables
      if (typeof (globalThis as any).Deno !== 'undefined') {
        apiKey = (globalThis as any).Deno.env.get("OPENROUTER_API_KEY") || "";
      } else if (typeof globalThis !== 'undefined' && (globalThis as any).process?.env) {
        apiKey = (globalThis as any).process.env.OPENROUTER_API_KEY || "";
      }
    } catch {
      // Final fallback
      apiKey = "";
    }

    return apiKey;
  }

  query<T>(sql: string, params: any[] = []): T[] {
    // Simple query simulation
    if (sql.includes("SELECT * FROM api_keys")) {
      if (params.length > 0) {
        // WHERE clause
        const [keyName, provider] = params;
        return this.apiKeys.filter(k => k.key_name === keyName && k.provider === provider) as T[];
      }
      return [...this.apiKeys] as T[];
    }

    if (sql.includes("SELECT * FROM test_results")) {
      const limit = params[0] || 50;
      return [...this.testResults].reverse().slice(0, limit) as T[];
    }

    if (sql.includes("SELECT * FROM providers")) {
      return [...this.providers] as T[];
    }

    if (sql.includes("SELECT * FROM providers WHERE name = ?")) {
      const name = params[0];
      return this.providers.filter(p => p.name === name) as T[];
    }

    if (sql.includes("SELECT * FROM run_history")) {
      const limit = params[0] || 50;
      const offset = params[1] || 0;
      return [...this.runHistory]
        .reverse()
        .slice(offset, offset + limit) as T[];
    }

    if (sql.includes("SELECT * FROM run_history WHERE created_at")) {
      const [startDate, endDate, limit] = params;
      return this.runHistory
        .filter(r => {
          const createdAt = new Date(r.created_at);
          const start = new Date(startDate);
          const end = new Date(endDate);
          return createdAt >= start && createdAt <= end;
        })
        .reverse()
        .slice(0, limit || 50) as T[];
    }

    if (sql.includes("SELECT * FROM llm_providers")) {
      if (params.length > 0) {
        const [name] = params;
        return this.llmProviders.filter(p => p.name === name) as T[];
      }
      return [...this.llmProviders] as T[];
    }

    if (sql.includes("SELECT * FROM llm_models")) {
      if (params.length > 0) {
        const [providerId] = params;
        return this.llmModels.filter(m => m.provider_id === providerId) as T[];
      }
      return [...this.llmModels] as T[];
    }

    return [];
  }

  execute(sql: string, params: any[] = []): { lastInsertRowId: number; changes: number } {
    // Simple execute simulation
    if (sql.includes("INSERT INTO api_keys")) {
      const [provider, keyName, keyValue] = params;
      const newKey = {
        id: this.nextId.apiKeys++,
        provider,
        key_name: keyName,
        key_value: keyValue,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      this.apiKeys.push(newKey);
      return { lastInsertRowId: newKey.id, changes: 1 };
    }

    if (sql.includes("INSERT INTO test_results")) {
      const [prompt, provider, model, responseTime, responseText, status] = params;
      const newResult = {
        id: this.nextId.testResults++,
        prompt,
        provider,
        model,
        response_time: responseTime,
        response_text: responseText,
        status,
        created_at: new Date().toISOString()
      };
      this.testResults.push(newResult);
      return { lastInsertRowId: newResult.id, changes: 1 };
    }

    if (sql.includes("UPDATE api_keys")) {
      const id = params[params.length - 1];
      const keyIndex = this.apiKeys.findIndex(k => k.id === id);

      if (keyIndex !== -1) {
        if (params.length > 1) {
          this.apiKeys[keyIndex].key_value = params[0];
          this.apiKeys[keyIndex].updated_at = new Date().toISOString();
        }
        return { lastInsertRowId: id, changes: 1 };
      }
    }

    if (sql.includes("DELETE FROM api_keys")) {
      const id = params[0];
      const originalLength = this.apiKeys.length;
      this.apiKeys = this.apiKeys.filter(k => k.id !== id);
      return { lastInsertRowId: 0, changes: originalLength - this.apiKeys.length };
    }

    if (sql.includes("INSERT INTO run_history")) {
      const [prompt, models, results] = params;
      const newRun: RunHistory = {
        id: this.nextId.runHistory++,
        prompt,
        models: JSON.parse(models),
        results: JSON.parse(results),
        created_at: new Date().toISOString()
      };
      this.runHistory.push(newRun);
      return { lastInsertRowId: newRun.id, changes: 1 };
    }

    if (sql.includes("INSERT INTO llm_providers")) {
      const [name, displayName, baseUrl, apiKeyRequired, isActive] = params;
      const newProvider: LLMProvider = {
        id: this.nextId.llmProviders++,
        name,
        display_name: displayName,
        base_url: baseUrl,
        api_key_required: Boolean(apiKeyRequired),
        is_active: Boolean(isActive),
        created_at: new Date().toISOString()
      };
      this.llmProviders.push(newProvider);
      return { lastInsertRowId: newProvider.id, changes: 1 };
    }

    if (sql.includes("INSERT INTO llm_models")) {
      const [providerId, modelId, displayName, description, contextLength, maxOutputTokens, inputCost, outputCost, supportsStreaming, supportsReasoning, isActive] = params;
      const newModel: LLMModel = {
        id: this.nextId.llmModels++,
        provider_id: providerId,
        model_id: modelId,
        display_name: displayName,
        description: description || undefined,
        context_length: contextLength || undefined,
        max_output_tokens: maxOutputTokens || undefined,
        input_cost_per_token: inputCost || undefined,
        output_cost_per_token: outputCost || undefined,
        supports_streaming: Boolean(supportsStreaming),
        supports_reasoning: Boolean(supportsReasoning),
        is_active: Boolean(isActive),
        created_at: new Date().toISOString()
      };
      this.llmModels.push(newModel);
      return { lastInsertRowId: newModel.id, changes: 1 };
    }

    if (sql.includes("UPDATE llm_models SET is_active")) {
      const [isActive, id] = params;
      const modelIndex = this.llmModels.findIndex(m => m.id === id);
      if (modelIndex !== -1) {
        this.llmModels[modelIndex].is_active = Boolean(isActive);
        return { lastInsertRowId: id, changes: 1 };
      }
    }

    if (sql.includes("DELETE FROM llm_models")) {
      const [id] = params;
      const originalLength = this.llmModels.length;
      this.llmModels = this.llmModels.filter(m => m.id !== id);
      return { lastInsertRowId: 0, changes: originalLength - this.llmModels.length };
    }

    return { lastInsertRowId: 0, changes: 0 };
  }

  deleteApiKey(keyName: string, provider: string): boolean {
    const initialLength = this.apiKeys.length;
    this.apiKeys = this.apiKeys.filter(k => !(k.key_name === keyName && k.provider === provider));
    return this.apiKeys.length < initialLength;
  }

  // Method to reload API keys from environment
  reloadApiKeysFromEnv(): void {
    const newApiKey = this.loadApiKeyFromEnv();
    if (newApiKey) {
      this.updateApiKey("OPENROUTER_API_KEY", newApiKey, "OpenRouter");
    }
  }

  updateApiKey(keyName: string, keyValue: string, provider: string): void {
    const keyIndex = this.apiKeys.findIndex(k => k.key_name === keyName && k.provider === provider);
    if (keyIndex !== -1) {
      this.apiKeys[keyIndex].key_value = keyValue;
      this.apiKeys[keyIndex].updated_at = new Date().toISOString();
    }
  }

  // Run history methods
  saveRunHistory(prompt: string, models: string[], results: any[]): number {
    const newRun: RunHistory = {
      id: this.nextId.runHistory++,
      prompt,
      models,
      results,
      created_at: new Date().toISOString()
    };
    this.runHistory.push(newRun);
    return newRun.id;
  }

  getRunHistory(limit: number = 50, offset: number = 0): RunHistory[] {
    return [...this.runHistory]
      .reverse()
      .slice(offset, offset + limit);
  }

  getRunHistoryByDateRange(startDate: string, endDate: string, limit: number = 50): RunHistory[] {
    return this.runHistory
      .filter(r => {
        const createdAt = new Date(r.created_at);
        const start = new Date(startDate);
        const end = new Date(endDate);
        return createdAt >= start && createdAt <= end;
      })
      .reverse()
      .slice(0, limit);
  }

  getRunStats(startDate?: string, endDate?: string): RunStats[] {
    let filteredRuns = this.runHistory;

    if (startDate && endDate) {
      filteredRuns = this.getRunHistoryByDateRange(startDate, endDate, 1000);
    }

    const modelStats = new Map<string, {
      responseTimes: number[];
      tokensPerSecond: number[];
      latencies: number[];
      tokens: number[];
      reasoningTokens: number[];
      totalRuns: number;
      successfulRuns: number;
    }>();

    filteredRuns.forEach(run => {
      run.results.forEach(result => {
        if (!modelStats.has(result.model)) {
          modelStats.set(result.model, {
            responseTimes: [],
            tokensPerSecond: [],
            latencies: [],
            tokens: [],
            reasoningTokens: [],
            totalRuns: 0,
            successfulRuns: 0
          });
        }

        const stats = modelStats.get(result.model)!;
        stats.totalRuns++;

        if (!result.error) {
          stats.successfulRuns++;
          if (result.responseTime) stats.responseTimes.push(result.responseTime);
          if (result.tokensPerSecond) stats.tokensPerSecond.push(result.tokensPerSecond);
          if (result.latency) stats.latencies.push(result.latency);
          if (result.tokens) stats.tokens.push(result.tokens);
          if (result.reasoningTokens) stats.reasoningTokens.push(result.reasoningTokens);
        }
      });
    });

    return Array.from(modelStats.entries()).map(([model, stats]) => ({
      model,
      avgResponseTime: stats.responseTimes.length > 0
        ? stats.responseTimes.reduce((a, b) => a + b, 0) / stats.responseTimes.length
        : 0,
      avgTokensPerSecond: stats.tokensPerSecond.length > 0
        ? stats.tokensPerSecond.reduce((a, b) => a + b, 0) / stats.tokensPerSecond.length
        : 0,
      avgLatency: stats.latencies.length > 0
        ? stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length
        : 0,
      avgTokens: stats.tokens.length > 0
        ? stats.tokens.reduce((a, b) => a + b, 0) / stats.tokens.length
        : 0,
      avgReasoningTokens: stats.reasoningTokens.length > 0
        ? stats.reasoningTokens.reduce((a, b) => a + b, 0) / stats.reasoningTokens.length
        : 0,
      totalRuns: stats.totalRuns,
      successRate: stats.totalRuns > 0 ? (stats.successfulRuns / stats.totalRuns) * 100 : 0
    }));
  }


  // Code evaluation runs
  saveCodeEvalRun(run: Omit<CodeEvalRun, "id" | "created_at">): number {
    const newRun: CodeEvalRun = {
      id: this.nextId.codeEvalRuns++,
      ...run,
      created_at: new Date().toISOString(),
    };
    this.codeEvalRuns.push(newRun);
    return newRun.id;
  }

  getCodeEvalRuns(limit: number = 50): CodeEvalRun[] {
    return [...this.codeEvalRuns].reverse().slice(0, limit);
  }

  // LLM Provider methods
  getLLMProviders(): LLMProvider[] {
    return [...this.llmProviders];
  }

  getLLMProvider(name: string): LLMProvider | undefined {
    return this.llmProviders.find(p => p.name === name);
  }

  createLLMProvider(provider: Omit<LLMProvider, "id" | "created_at">): number {
    const newProvider: LLMProvider = {
      id: this.nextId.llmProviders++,
      ...provider,
      created_at: new Date().toISOString()
    };
    this.llmProviders.push(newProvider);
    return newProvider.id;
  }

  // LLM Model methods
  getLLMModels(providerId?: number): LLMModel[] {
    if (providerId) {
      return this.llmModels.filter(m => m.provider_id === providerId);
    }
    return [...this.llmModels];
  }

  getLLMModel(id: number): LLMModel | undefined {
    return this.llmModels.find(m => m.id === id);
  }

  createLLMModel(model: Omit<LLMModel, "id" | "created_at">): number {
    const newModel: LLMModel = {
      id: this.nextId.llmModels++,
      ...model,
      created_at: new Date().toISOString()
    };
    this.llmModels.push(newModel);
    return newModel.id;
  }

  updateLLMModel(id: number, updates: Partial<LLMModel>): boolean {
    const modelIndex = this.llmModels.findIndex(m => m.id === id);
    if (modelIndex !== -1) {
      this.llmModels[modelIndex] = { ...this.llmModels[modelIndex], ...updates };
      return true;
    }
    return false;
  }

  deleteLLMModel(id: number): boolean {
    const originalLength = this.llmModels.length;
    this.llmModels = this.llmModels.filter(m => m.id !== id);
    return this.llmModels.length < originalLength;
  }
}

const db = new InMemoryDB();

export default db;
export type { RunHistory, RunStats, LLMProvider, LLMModel };