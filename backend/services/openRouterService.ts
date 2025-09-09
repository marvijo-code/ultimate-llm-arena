import { DbService } from "./dbService.ts";

export interface OpenRouterMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OpenRouterRequest {
  model: string;
  messages: OpenRouterMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  stream_options?: {
    include_usage?: boolean;
  };
}

export interface OpenRouterResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    message: {
      role: string;
      content: string;
      reasoning_content?: string; // For reasoning models like DeepSeek R1
    };
    finish_reason: string;
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    reasoning_tokens?: number; // For OpenAI o1/o3 models
  };
}

export interface StreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    delta: {
      role?: string;
      content?: string;
      reasoning_content?: string; // For DeepSeek R1 streaming
    };
    finish_reason?: string;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    reasoning_tokens?: number;
  };
}

export class OpenRouterService {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl = "https://openrouter.ai/api/v1") {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  async generateCompletion(
    request: OpenRouterRequest,
    modelDisplayName: string = request.model
  ): Promise<{ responseTime: number; response: OpenRouterResponse | null; error: string | null }> {
    // Enable streaming with usage for reasoning models
    if (request.stream && !request.stream_options) {
      request.stream_options = { include_usage: true };
    }
    const startTime = Date.now();
    
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.apiKey}`,
          "HTTP-Referer": "http://localhost:5173", // Your app's URL
          "X-Title": "LLM Speed Test", // Your app's name
        },
        body: JSON.stringify(request),
      });

      const responseTime = Date.now() - startTime;

      if (!response.ok) {
        const errorText = await response.text();
        return {
          responseTime,
          response: null,
          error: `HTTP error! status: ${response.status}, message: ${errorText}`,
        };
      }

      const data: OpenRouterResponse = await response.json();
      
      // Store the result in the database
      const prompt = request.messages
        .filter(msg => msg.role === "user")
        .map(msg => msg.content)
        .join("\n");
      
      const responseText = data.choices[0]?.message?.content || "";
      const reasoningText = data.choices[0]?.message?.reasoning_content || "";
      const fullResponse = reasoningText ? `[REASONING]\n${reasoningText}\n\n[ANSWER]\n${responseText}` : responseText;
      
      DbService.createTestResult({
        prompt,
        provider: "OpenRouter",
        model: modelDisplayName,
        response_time: responseTime,
        response_text: fullResponse,
        status: "completed"
      });

      return {
        responseTime,
        response: data,
        error: null,
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      
      // Store the error in the database
      const prompt = request.messages
        .filter(msg => msg.role === "user")
        .map(msg => msg.content)
        .join("\n");
      
      DbService.createTestResult({
        prompt,
        provider: "OpenRouter",
        model: modelDisplayName,
        response_time: responseTime,
        response_text: "",
        status: `error: ${errorMessage}`
      });

      return {
        responseTime,
        response: null,
        error: errorMessage,
      };
    }
  }

  async getModels(): Promise<any[]> {
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data.data || [];
    } catch (error) {
      console.error("Error fetching models:", error);
      return [];
    }
  }

  static async testConnection(apiKey: string): Promise<boolean> {
    try {
      const service = new OpenRouterService(apiKey);
      const models = await service.getModels();
      return models.length > 0;
    } catch (error) {
      console.error("Connection test failed:", error);
      return false;
    }
  }

  async generateStreamingCompletion(
    request: OpenRouterRequest,
    modelDisplayName: string = request.model,
    onChunk?: (chunk: StreamChunk) => void
  ): Promise<{ responseTime: number; response: OpenRouterResponse | null; error: string | null }> {
    const startTime = Date.now();
    
    // Ensure streaming is enabled with usage tracking
    const streamingRequest = {
      ...request,
      stream: true,
      stream_options: { include_usage: true }
    };
    
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.apiKey}`,
          "HTTP-Referer": "http://localhost:5173",
          "X-Title": "LLM Speed Test",
        },
        body: JSON.stringify(streamingRequest),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          responseTime: Date.now() - startTime,
          response: null,
          error: `HTTP error! status: ${response.status}, message: ${errorText}`,
        };
      }

      const reader = response.body?.getReader();
      if (!reader) {
        return {
          responseTime: Date.now() - startTime,
          response: null,
          error: "No response body reader available",
        };
      }

      let fullContent = "";
      let fullReasoningContent = "";
      let finalUsage: any = null;
      let lastChunk: StreamChunk | null = null;

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            
            try {
              const chunk: StreamChunk = JSON.parse(data);
              lastChunk = chunk;
              
              // Accumulate content
              if (chunk.choices?.[0]?.delta?.content) {
                fullContent += chunk.choices[0].delta.content;
              }
              
              // Accumulate reasoning content (for DeepSeek R1)
              if (chunk.choices?.[0]?.delta?.reasoning_content) {
                fullReasoningContent += chunk.choices[0].delta.reasoning_content;
              }
              
              // Store final usage info
              if (chunk.usage) {
                finalUsage = chunk.usage;
              }
              
              // Call the callback if provided
              if (onChunk) {
                onChunk(chunk);
              }
            } catch (e) {
              // Skip malformed chunks
              console.warn('Skipping malformed chunk:', data);
            }
          }
        }
      }

      const responseTime = Date.now() - startTime;
      
      // Construct final response
      const finalResponse: OpenRouterResponse = {
        id: lastChunk?.id || 'stream-response',
        object: 'chat.completion',
        created: lastChunk?.created || Math.floor(Date.now() / 1000),
        model: lastChunk?.model || request.model,
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: fullContent,
            reasoning_content: fullReasoningContent || undefined
          },
          finish_reason: 'stop'
        }],
        usage: finalUsage || {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0
        }
      };

      // Store the result in the database
      const prompt = request.messages
        .filter(msg => msg.role === "user")
        .map(msg => msg.content)
        .join("\n");
      
      const fullResponseText = fullReasoningContent ? 
        `[REASONING]\n${fullReasoningContent}\n\n[ANSWER]\n${fullContent}` : 
        fullContent;
      
      DbService.createTestResult({
        prompt,
        provider: "OpenRouter",
        model: modelDisplayName,
        response_time: responseTime,
        response_text: fullResponseText,
        status: "completed"
      });

      return {
        responseTime,
        response: finalResponse,
        error: null,
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      
      // Store the error in the database
      const prompt = request.messages
        .filter(msg => msg.role === "user")
        .map(msg => msg.content)
        .join("\n");
      
      DbService.createTestResult({
        prompt,
        provider: "OpenRouter",
        model: modelDisplayName,
        response_time: responseTime,
        response_text: "",
        status: `error: ${errorMessage}`
      });

      return {
        responseTime,
        response: null,
        error: errorMessage,
      };
    }
  }
}