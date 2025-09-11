import { DB } from "sqlite";

export interface RunHistory {
  id: number;
  prompt: string;
  models: string[];
  results: any[];
  created_at: string;
}

export interface RunStats {
  model: string;
  avgResponseTime: number;
  avgTokensPerSecond: number;
  avgLatency: number;
  totalRuns: number;
  successRate: number;
  avgTokens: number;
  avgReasoningTokens: number;
}

export interface LLMProvider {
  id: number;
  name: string;
  display_name: string;
  base_url: string;
  api_key_required: boolean;
  is_active: boolean;
  created_at: string;
}

export interface LLMModel {
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

export interface ExecResult { lastInsertRowId: number; changes: number }

class SQLiteDB {
  private db: DB;

  constructor() {
    const databasePath = (globalThis as any).Deno?.env?.get("DATABASE_PATH") || "./llm_speed_test.db";
    this.db = new DB(databasePath);
    this.initSchema();
    this.seedProviders();
    this.seedApiKeyFromEnv();
  }

  private initSchema() {
    // Basic tables used by services and routes
    this.db.execute(`CREATE TABLE IF NOT EXISTS api_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      key_name TEXT NOT NULL,
      key_value TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`);

    this.db.execute(`CREATE TABLE IF NOT EXISTS test_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prompt TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      response_time INTEGER NOT NULL,
      response_text TEXT,
      status TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`);

    this.db.execute(`CREATE TABLE IF NOT EXISTS providers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      base_url TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`);

    this.db.execute(`CREATE TABLE IF NOT EXISTS run_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prompt TEXT NOT NULL,
      models TEXT NOT NULL,
      results TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`);

    this.db.execute(`CREATE TABLE IF NOT EXISTS llm_providers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      base_url TEXT NOT NULL,
      api_key_required INTEGER NOT NULL DEFAULT 1,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`);

    this.db.execute(`CREATE TABLE IF NOT EXISTS llm_models (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider_id INTEGER NOT NULL,
      model_id TEXT NOT NULL,
      display_name TEXT NOT NULL,
      description TEXT,
      context_length INTEGER,
      max_output_tokens INTEGER,
      input_cost_per_token REAL,
      output_cost_per_token REAL,
      supports_streaming INTEGER NOT NULL DEFAULT 1,
      supports_reasoning INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (provider_id) REFERENCES llm_providers(id)
    )`);

    this.db.execute(`CREATE TABLE IF NOT EXISTS code_eval_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exerciseId TEXT NOT NULL,
      exerciseName TEXT NOT NULL,
      testCount INTEGER NOT NULL,
      models TEXT NOT NULL,
      results TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`);
  }

  private seedProviders() {
    const row = this.query<{ c: number }>("SELECT COUNT(*) as c FROM llm_providers")[0];
    const count = row?.c ?? 0;
    if (count > 0) return;
    const providers: Omit<LLMProvider, "id" | "created_at">[] = [
      { name: "openrouter", display_name: "OpenRouter", base_url: "https://openrouter.ai/api/v1", api_key_required: true, is_active: true },
      { name: "openai", display_name: "OpenAI", base_url: "https://api.openai.com/v1", api_key_required: true, is_active: true },
      { name: "anthropic", display_name: "Anthropic", base_url: "https://api.anthropic.com/v1", api_key_required: true, is_active: true },
      { name: "google", display_name: "Google", base_url: "https://generativelanguage.googleapis.com/v1", api_key_required: true, is_active: true },
      { name: "deepseek", display_name: "DeepSeek", base_url: "https://api.deepseek.com/v1", api_key_required: true, is_active: true },
      { name: "xai", display_name: "xAI", base_url: "https://api.x.ai/v1", api_key_required: true, is_active: true },
    ] as any;
    const stmt = this.db.prepareQuery(
      "INSERT INTO llm_providers (name, display_name, base_url, api_key_required, is_active) VALUES (?, ?, ?, ?, ?)"
    );
    for (const p of providers) {
      stmt.execute([p.name, p.display_name, p.base_url, p.api_key_required ? 1 : 0, p.is_active ? 1 : 0]);
    }
    stmt.finalize();
  }

  private seedApiKeyFromEnv() {
    try {
      const existing = this.query("SELECT id FROM api_keys WHERE key_name = ? AND provider = ?", ["OPENROUTER_API_KEY", "OpenRouter"]);
      if (existing.length === 0) {
        const envKey = (globalThis as any).Deno?.env?.get("OPENROUTER_API_KEY") || "";
        this.execute(
          "INSERT INTO api_keys (provider, key_name, key_value) VALUES (?, ?, ?)",
          ["OpenRouter", "OPENROUTER_API_KEY", envKey]
        );
      }
    } catch {
      // ignore
    }
  }

  // Generic query/execute
  query<T = any>(sql: string, params: any[] = []): T[] {
    const q = this.db.prepareQuery(sql);
    const rows = q.allEntries(params);
    q.finalize();
    return rows as unknown as T[];
  }

  execute(sql: string, params: any[] = []): ExecResult {
    const q = this.db.prepareQuery(sql);
    const result = q.execute(params);
    const lastId = (this.db as any).lastInsertRowId as number | undefined;
    q.finalize();
    return { lastInsertRowId: lastId ?? 0, changes: (result as any)?.changes ?? 0 };
  }

  // Run history
  saveRunHistory(prompt: string, models: string[], results: any[]): number {
    const res = this.execute(
      "INSERT INTO run_history (prompt, models, results) VALUES (?, ?, ?)",
      [prompt, JSON.stringify(models), JSON.stringify(results)]
    );
    return res.lastInsertRowId;
  }

  getRunHistory(limit: number = 50, offset: number = 0): RunHistory[] {
    const rows = this.query<any>("SELECT * FROM run_history ORDER BY created_at DESC LIMIT ? OFFSET ?", [limit, offset]);
    return rows.map((r) => ({ ...r, models: JSON.parse(r.models), results: JSON.parse(r.results) }));
  }

  getRunHistoryByDateRange(startDate: string, endDate: string, limit: number = 50): RunHistory[] {
    const rows = this.query<any>(
      "SELECT * FROM run_history WHERE created_at BETWEEN ? AND ? ORDER BY created_at DESC LIMIT ?",
      [startDate, endDate, limit]
    );
    return rows.map((r) => ({ ...r, models: JSON.parse(r.models), results: JSON.parse(r.results) }));
  }

  getRunStats(startDate?: string, endDate?: string): RunStats[] {
    const rows = startDate && endDate
      ? this.getRunHistoryByDateRange(startDate, endDate, 1000)
      : this.getRunHistory(1000, 0);

    const stats = new Map<string, {
      responseTimes: number[]; tokensPerSecond: number[]; latencies: number[]; tokens: number[]; reasoningTokens: number[]; totalRuns: number; successfulRuns: number;
    }>();

    for (const run of rows) {
      for (const result of run.results) {
        const model = result.model;
        if (!stats.has(model)) stats.set(model, { responseTimes: [], tokensPerSecond: [], latencies: [], tokens: [], reasoningTokens: [], totalRuns: 0, successfulRuns: 0 });
        const s = stats.get(model)!;
        s.totalRuns++;
        if (!result.error) {
          s.successfulRuns++;
          if (typeof result.responseTime === 'number') s.responseTimes.push(result.responseTime);
          if (typeof result.tokensPerSecond === 'number') s.tokensPerSecond.push(result.tokensPerSecond);
          if (typeof result.latency === 'number') s.latencies.push(result.latency);
          if (typeof result.tokens === 'number') s.tokens.push(result.tokens);
          if (typeof result.reasoningTokens === 'number') s.reasoningTokens.push(result.reasoningTokens);
        }
      }
    }

    const arr: RunStats[] = [];
    for (const [model, s] of stats.entries()) {
      const avg = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
      arr.push({
        model,
        avgResponseTime: avg(s.responseTimes),
        avgTokensPerSecond: avg(s.tokensPerSecond),
        avgLatency: avg(s.latencies),
        avgTokens: avg(s.tokens),
        avgReasoningTokens: avg(s.reasoningTokens),
        totalRuns: s.totalRuns,
        successRate: s.totalRuns ? (s.successfulRuns / s.totalRuns) * 100 : 0,
      });
    }
    return arr;
  }

  // LLM Provider/Model helpers
  getLLMProviders(): LLMProvider[] {
    const rows = this.query<any>("SELECT * FROM llm_providers");
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      display_name: r.display_name,
      base_url: r.base_url,
      api_key_required: !!r.api_key_required,
      is_active: !!r.is_active,
      created_at: r.created_at,
    }));
  }

  getLLMProvider(name: string): LLMProvider | undefined {
    const row = this.query<any>("SELECT * FROM llm_providers WHERE name = ?", [name])[0];
    return row ? {
      id: row.id,
      name: row.name,
      display_name: row.display_name,
      base_url: row.base_url,
      api_key_required: !!row.api_key_required,
      is_active: !!row.is_active,
      created_at: row.created_at,
    } : undefined;
  }

  createLLMProvider(provider: Omit<LLMProvider, "id" | "created_at">): number {
    const res = this.execute(
      "INSERT INTO llm_providers (name, display_name, base_url, api_key_required, is_active) VALUES (?, ?, ?, ?, ?)",
      [provider.name, provider.display_name, provider.base_url, provider.api_key_required ? 1 : 0, provider.is_active ? 1 : 0]
    );
    return res.lastInsertRowId;
  }

  getLLMModels(providerId?: number): LLMModel[] {
    const rows = providerId
      ? this.query<any>("SELECT * FROM llm_models WHERE provider_id = ?", [providerId])
      : this.query<any>("SELECT * FROM llm_models");
    return rows.map((r) => ({
      id: r.id,
      provider_id: r.provider_id,
      model_id: r.model_id,
      display_name: r.display_name,
      description: r.description ?? undefined,
      context_length: r.context_length ?? undefined,
      max_output_tokens: r.max_output_tokens ?? undefined,
      input_cost_per_token: r.input_cost_per_token ?? undefined,
      output_cost_per_token: r.output_cost_per_token ?? undefined,
      supports_streaming: !!r.supports_streaming,
      supports_reasoning: !!r.supports_reasoning,
      is_active: !!r.is_active,
      created_at: r.created_at,
    }));
  }

  getLLMModel(id: number): LLMModel | undefined {
    const row = this.query<any>("SELECT * FROM llm_models WHERE id = ?", [id])[0];
    return row ? {
      id: row.id,
      provider_id: row.provider_id,
      model_id: row.model_id,
      display_name: row.display_name,
      description: row.description ?? undefined,
      context_length: row.context_length ?? undefined,
      max_output_tokens: row.max_output_tokens ?? undefined,
      input_cost_per_token: row.input_cost_per_token ?? undefined,
      output_cost_per_token: row.output_cost_per_token ?? undefined,
      supports_streaming: !!row.supports_streaming,
      supports_reasoning: !!row.supports_reasoning,
      is_active: !!row.is_active,
      created_at: row.created_at,
    } : undefined;
  }

  createLLMModel(model: Omit<LLMModel, "id" | "created_at">): number {
    const res = this.execute(
      `INSERT INTO llm_models (provider_id, model_id, display_name, description, context_length, max_output_tokens, input_cost_per_token, output_cost_per_token, supports_streaming, supports_reasoning, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [model.provider_id, model.model_id, model.display_name, model.description ?? null, model.context_length ?? null, model.max_output_tokens ?? null, model.input_cost_per_token ?? null, model.output_cost_per_token ?? null, model.supports_streaming ? 1 : 0, model.supports_reasoning ? 1 : 0, model.is_active ? 1 : 0]
    );
    return res.lastInsertRowId;
  }

  updateLLMModel(id: number, updates: Partial<LLMModel>): boolean {
    const allowed = ["provider_id","model_id","display_name","description","context_length","max_output_tokens","input_cost_per_token","output_cost_per_token","supports_streaming","supports_reasoning","is_active"] as const;
    const fields: string[] = [];
    const params: any[] = [];
    for (const key of allowed) {
      if (key in updates) {
        fields.push(`${key} = ?`);
        const val = (updates as any)[key];
        params.push(typeof val === 'boolean' ? (val ? 1 : 0) : val);
      }
    }
    if (fields.length === 0) return false;
    params.push(id);
    const sql = `UPDATE llm_models SET ${fields.join(", ")} WHERE id = ?`;
    const res = this.execute(sql, params);
    return res.changes > 0;
  }

  deleteLLMModel(id: number): boolean {
    const res = this.execute("DELETE FROM llm_models WHERE id = ?", [id]);
    return res.changes > 0;
  }

  // Code evaluation runs
  saveCodeEvalRun(run: { exerciseId: string; exerciseName: string; testCount: number; models: string[]; results: any[] }): number {
    const res = this.execute(
      "INSERT INTO code_eval_runs (exerciseId, exerciseName, testCount, models, results) VALUES (?, ?, ?, ?, ?)",
      [run.exerciseId, run.exerciseName, run.testCount, JSON.stringify(run.models), JSON.stringify(run.results)]
    );
    return res.lastInsertRowId;
  }

  getCodeEvalRuns(limit: number = 50): any[] {
    const rows = this.query<any>("SELECT * FROM code_eval_runs ORDER BY created_at DESC LIMIT ?", [limit]);
    return rows.map((r) => ({ ...r, models: JSON.parse(r.models), results: JSON.parse(r.results) }));
  }
}

const sqliteDb = new SQLiteDB();
export default sqliteDb;

