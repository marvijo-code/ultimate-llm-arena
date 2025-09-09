import db from "../db.ts";
import type { LLMProvider, LLMModel } from "../db.ts";

export interface ApiKey {
  id?: number;
  provider: string;
  key_name: string;
  key_value: string;
  created_at?: string;
  updated_at?: string;
}

export interface TestResult {
  id?: number;
  prompt: string;
  provider: string;
  model: string;
  response_time: number;
  response_text?: string;
  status: string;
  created_at?: string;
}

export interface Provider {
  id?: number;
  name: string;
  base_url: string;
  is_active: boolean;
  created_at?: string;
}

export class DbService {
  // API Key operations
  static getApiKeys(provider?: string): ApiKey[] {
    let query = "SELECT * FROM api_keys";
    const params: any[] = [];
    
    if (provider) {
      query += " WHERE provider = ?";
      params.push(provider);
    }
    
    const results = db.query(query, params);
    return results.map((row: any) => ({
      id: row.id,
      provider: row.provider,
      key_name: row.key_name,
      key_value: row.key_value,
      created_at: row.created_at,
      updated_at: row.updated_at
    }));
  }

  static getApiKey(keyName: string, provider: string): ApiKey | undefined {
    const result = db.query("SELECT * FROM api_keys WHERE key_name = ? AND provider = ?", [keyName, provider]);
    if (result.length === 0) return undefined;
    
    const row = result[0] as any;
    return {
      id: row.id,
      provider: row.provider,
      key_name: row.key_name,
      key_value: row.key_value,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }

  static createApiKey(apiKey: Omit<ApiKey, "id" | "created_at" | "updated_at">): number {
    const result = db.execute(
      "INSERT INTO api_keys (provider, key_name, key_value) VALUES (?, ?, ?)",
      [apiKey.provider, apiKey.key_name, apiKey.key_value]
    );
    return result.lastInsertRowId;
  }

  static updateApiKey(id: number, apiKey: Partial<ApiKey>): void {
    const fields: string[] = [];
    const params: any[] = [];
    
    if (apiKey.key_value !== undefined) {
      fields.push("key_value = ?");
      params.push(apiKey.key_value);
    }
    
    if (fields.length === 0) return;
    
    params.push(id);
    const sql = `UPDATE api_keys SET ${fields.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
    db.execute(sql, params);
  }

  static deleteApiKey(id: number): void {
    db.execute("DELETE FROM api_keys WHERE id = ?", [id]);
  }

  // Test result operations
  static getTestResults(limit = 50): TestResult[] {
    const results = db.query("SELECT * FROM test_results ORDER BY created_at DESC LIMIT ?", [limit]);
    return results.map((row: any) => ({
      id: row.id,
      prompt: row.prompt,
      provider: row.provider,
      model: row.model,
      response_time: row.response_time,
      response_text: row.response_text,
      status: row.status,
      created_at: row.created_at
    }));
  }

  static createTestResult(testResult: Omit<TestResult, "id" | "created_at">): number {
    const result = db.execute(
      "INSERT INTO test_results (prompt, provider, model, response_time, response_text, status) VALUES (?, ?, ?, ?, ?, ?)",
      [testResult.prompt, testResult.provider, testResult.model, testResult.response_time, testResult.response_text, testResult.status]
    );
    return result.lastInsertRowId;
  }

  // Provider operations
  static getProviders(): Provider[] {
    const results = db.query("SELECT * FROM providers");
    return results.map((row: any) => ({
      id: row.id,
      name: row.name,
      base_url: row.base_url,
      is_active: Boolean(row.is_active),
      created_at: row.created_at
    }));
  }

  static getProvider(name: string): Provider | undefined {
    const result = db.query("SELECT * FROM providers WHERE name = ?", [name]);
    if (result.length === 0) return undefined;
    
    const row = result[0] as any;
    return {
      id: row.id,
      name: row.name,
      base_url: row.base_url,
      is_active: Boolean(row.is_active),
      created_at: row.created_at
    };
  }

  static createProvider(provider: Omit<Provider, "id" | "created_at">): number {
    const result = db.execute(
      "INSERT INTO providers (name, base_url, is_active) VALUES (?, ?, ?)",
      [provider.name, provider.base_url, provider.is_active ? 1 : 0]
    );
    return result.lastInsertRowId;
  }

  // LLM Provider operations
  static getLLMProviders(): LLMProvider[] {
    return db.getLLMProviders();
  }

  static getLLMProvider(name: string): LLMProvider | undefined {
    return db.getLLMProvider(name);
  }

  static createLLMProvider(provider: Omit<LLMProvider, "id" | "created_at">): number {
    return db.createLLMProvider(provider);
  }

  // LLM Model operations
  static getLLMModels(providerId?: number): LLMModel[] {
    return db.getLLMModels(providerId);
  }

  static getLLMModel(id: number): LLMModel | undefined {
    return db.getLLMModel(id);
  }

  static createLLMModel(model: Omit<LLMModel, "id" | "created_at">): number {
    return db.createLLMModel(model);
  }

  static updateLLMModel(id: number, updates: Partial<LLMModel>): boolean {
    return db.updateLLMModel(id, updates);
  }

  static deleteLLMModel(id: number): boolean {
    return db.deleteLLMModel(id);
  }
}