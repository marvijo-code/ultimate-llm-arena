const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:6100';

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface LLMModel {
  id: number;
  provider_name: string;
  model_name: string;
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

export interface LLMModelsResponse {
  models: LLMModel[];
}

export interface OpenRouterModel {
  id: string;
  name?: string;
  context_length?: number;
  pricing?: {
    prompt: string;
    completion: string;
  };
}

export interface TopModelsResponse {
  success: boolean;
  models: OpenRouterModel[];
}

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

export interface RunHistory {
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


export interface Exercise {
  id: string;
  name: string;
  language: string;
  totalTests: number;
}

export interface CodeEvalResult {
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

export interface CodeEvalRun {
  id: number;
  exerciseId: string;
  exerciseName: string;
  testCount: number;
  models: string[];
  results: CodeEvalResult[];
  created_at: string;
}

class ApiService {
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${API_BASE_URL}${endpoint}`;

    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });

    if (!response.ok) {
      // Try to parse error response body for better error messages
      try {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      } catch (parseError) {
        // If parsing fails, fall back to status-based error
        throw new Error(`HTTP error! status: ${response.status}`);
      }
    }

    return await response.json();
  }

  // OpenRouter API endpoints
  async getModels() {
    return this.request('/api/openrouter/models');
  }

  // Get top 10 OpenRouter models without API key
  async getTopModels(): Promise<TopModelsResponse> {
    const response = await this.request('/api/llm/providers/openrouter/models');
    return response as TopModelsResponse;
  }

  async testConnection(apiKey: string) {
    return this.request('/api/openrouter/test-connection', {
      method: 'POST',
      body: JSON.stringify({ apiKey }),
    });
  }

  async generateCompletion(prompt: string, model: string, temperature = 0.7, maxTokens = 1000) {
    return this.request('/api/openrouter/generate', {
      method: 'POST',
      body: JSON.stringify({
        prompt,
        model,
        temperature,
        max_tokens: maxTokens,
      }),
    });
  }

  async saveApiKey(apiKey: string) {
    return this.request('/api/openrouter/api-key', {
      method: 'POST',
      body: JSON.stringify({ apiKey }),
    });
  }

  async getApiKeyStatus() {
    return this.request('/api/openrouter/api-key/status');
  }

  // Speed test endpoints
  async runSpeedTest(request: SpeedTestRequest) {
    return this.request<SpeedTestComparison>('/api/speed-test/run', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  async getTestHistory(limit = 20) {
    return this.request<TestResult[]>(`/api/speed-test/history?limit=${limit}`, {
      method: 'GET',
    });
  }

  async getAvailableModels() {
    return this.request('/api/speed-test/models');
  }

  async getPopularModels() {
    return this.request('/api/speed-test/popular-models');
  }

  // LLM Management endpoints
  async getSavedModels() {
    return this.request<LLMModelsResponse>('/api/llm/models');
  }

  // Streaming speed test
  async runStreamingSpeedTest(
    request: SpeedTestRequest,
    onEvent: (event: StreamingEvent) => void
  ): Promise<void> {
    const url = `${API_BASE_URL}/api/speed-test/run-stream`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body reader available');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const event: StreamingEvent = JSON.parse(data);
              onEvent(event);
            } catch (e) {
              console.warn('Failed to parse streaming event:', data);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  // Test results endpoint
  async getTestResults(limit = 50) {
    return this.request<TestResult[]>(`/api/test-results?limit=${limit}`);
  }


  // Exercism evaluation endpoints
  async getExercises() {
    return this.request<Exercise[] | { exercises: Exercise[] }>(`/api/exercism/exercises`);
  }

  async runExercism(exerciseId: string, models: string[], testCount?: number) {
    return this.request<{ runId: number; exerciseId: string; exerciseName: string; testCount: number; results: CodeEvalResult[] }>(
      '/api/exercism/run',
      {
        method: 'POST',
        body: JSON.stringify({ exerciseId, models, testCount }),
      }
    );
  }

  async getExercismHistory(limit = 50) {
    return this.request<CodeEvalRun[]>(`/api/exercism/history?limit=${limit}`);
  }


  // Run history endpoints
  async saveRunHistory(prompt: string, models: string[], results: any[]) {
    return this.request('/api/run-history', {
      method: 'POST',
      body: JSON.stringify({ prompt, models, results }),
    });
  }

  async getRunHistory(limit = 50, offset = 0, startDate?: string, endDate?: string) {
    const params = new URLSearchParams({
      limit: limit.toString(),
      offset: offset.toString(),
    });

    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);

    return this.request<RunHistory[]>(`/api/run-history?${params}`);
  }

  async getRunStats(startDate?: string, endDate?: string) {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);

    const queryString = params.toString();
    return this.request<RunStats[]>(`/api/run-stats${queryString ? '?' + queryString : ''}`);
  }
}

export const apiService = new ApiService();