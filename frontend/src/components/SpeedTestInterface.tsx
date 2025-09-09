import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel } from '@/components/ui/dropdown-menu'
import { useToast } from '@/hooks/use-toast'
import { 
  Loader2, 
  Zap, 
  Clock, 
  Cpu, 
  Settings, 
  Play, 
  CheckCircle2,
  AlertCircle,
  Sparkles,
  TrendingUp,
  ArrowDown,
  Activity,
  Code,
  Database,
  Globe,
  Smartphone,
  BarChart3
} from 'lucide-react';
import { apiService } from '@/services/api';
import type { SpeedTestComparison, StreamingEvent, LLMModel } from '@/services/api';

interface ApiKeyStatusResponse {
  hasApiKey: boolean;
}

// Programming prompt categories with comprehensive examples
const PROGRAMMING_PROMPTS = {
  "Algorithms & Data Structures": {
    icon: Code,
    prompts: [
      "Implement a binary search tree with insert, delete, and search operations in your preferred language.",
      "Write a function to find the longest common subsequence between two strings using dynamic programming.",
      "Create a graph traversal algorithm (BFS/DFS) to find the shortest path between two nodes.",
      "Implement a hash table with collision handling using chaining or open addressing.",
      "Write a merge sort algorithm and explain its time complexity advantages over bubble sort.",
      "Create a function to detect cycles in a linked list using Floyd's cycle detection algorithm."
    ]
  },
  "Web Development": {
    icon: Globe,
    prompts: [
      "Build a REST API with authentication, rate limiting, and proper error handling using Node.js/Express.",
      "Create a responsive React component that fetches and displays paginated data with search functionality.",
      "Implement a real-time chat application using WebSockets with message persistence.",
      "Design a secure user authentication system with JWT tokens, refresh tokens, and password hashing.",
      "Build a progressive web app (PWA) with offline functionality and service worker caching.",
      "Create a GraphQL API with queries, mutations, and subscriptions for a blog platform."
    ]
  },
  "Database Design": {
    icon: Database,
    prompts: [
      "Design a normalized database schema for an e-commerce platform with users, products, orders, and inventory.",
      "Write complex SQL queries to analyze sales data including joins, subqueries, and window functions.",
      "Create a database migration strategy for a production system with zero downtime.",
      "Design a data warehouse schema for analytics with fact and dimension tables.",
      "Implement database indexing strategies to optimize query performance for a high-traffic application.",
      "Create a backup and disaster recovery plan for a critical database system."
    ]
  },
  "Mobile Development": {
    icon: Smartphone,
    prompts: [
      "Build a cross-platform mobile app using React Native with navigation and state management.",
      "Create a native iOS app with Core Data persistence and push notifications.",
      "Implement offline-first architecture for a mobile app with data synchronization.",
      "Design a mobile app UI/UX following platform-specific design guidelines (Material Design/Human Interface).",
      "Build a location-based mobile app with GPS tracking and geofencing capabilities.",
      "Create a mobile app with camera integration, image processing, and cloud storage."
    ]
  },
  "System Design & Architecture": {
    icon: BarChart3,
    prompts: [
      "Design a scalable microservices architecture for a social media platform handling millions of users.",
      "Create a distributed caching strategy using Redis for a high-traffic e-commerce site.",
      "Design a CI/CD pipeline with automated testing, deployment, and rollback capabilities.",
      "Implement a message queue system for handling asynchronous tasks in a distributed system.",
      "Design a monitoring and alerting system for a production application with SLA requirements.",
      "Create a disaster recovery plan for a multi-region cloud infrastructure."
    ]
  }
};

// Get all prompts as a flat array for random selection
const ALL_PROMPTS = Object.values(PROGRAMMING_PROMPTS).flatMap(category => category.prompts);

interface StreamingResult {
  model: string;
  content: string;
  reasoningContent?: string;
  isComplete: boolean;
  error?: string;
  responseTime?: number;
  tokens?: number;
  reasoningTokens?: number;
  latency?: number;
  tokensPerSecond?: number;
  firstTokenTime?: number;
  isStreaming?: boolean;
}

interface SpeedTestInterfaceProps {
  onShowDashboard?: () => void;
}

export function SpeedTestInterface({ onShowDashboard }: SpeedTestInterfaceProps) {
  const { toast } = useToast();
  const [prompt, setPrompt] = useState('');
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [streamingResults, setStreamingResults] = useState<StreamingResult[]>([]);
  const [popularModels, setPopularModels] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<SpeedTestComparison | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  const [, setApiKeyStatus] = useState(false);

  useEffect(() => {
    // Set random prompt on load
    const randomPrompt = ALL_PROMPTS[Math.floor(Math.random() * ALL_PROMPTS.length)];
    setPrompt(randomPrompt);

    // Check API key status
    const checkApiKeyStatus = async () => {
      try {
        const response = await apiService.getApiKeyStatus();
        if (response.success && response.data) {
          const data = response.data as ApiKeyStatusResponse;
          setApiKeyStatus(data.hasApiKey);
          setShowApiKeyInput(!data.hasApiKey);
        } else {
          setShowApiKeyInput(true);
        }
      } catch (error) {
        console.error('Error checking API key status:', error);
        setShowApiKeyInput(true);
        toast({
          variant: "destructive",
          title: "Connection Error",
          description: "Failed to check API key status. Please check your connection."
        });
      }
    };

    checkApiKeyStatus();
  }, []);

  const loadPopularModels = async () => {
    try {
      // First try to load saved models from LLM Management
      const savedResponse = await apiService.getSavedModels();
      if (savedResponse.success && savedResponse.data?.models) {
        const savedModels = savedResponse.data.models
          .filter((model: LLMModel) => model.is_active)
          .map((model: LLMModel) => `${model.provider_name}/${model.model_name}`);
        
        if (savedModels.length > 0) {
          setPopularModels(savedModels);
          setSelectedModels(savedModels.slice(0, 3)); // Select first 3 by default
          return;
        }
      }
      
      // Fallback to popular models if no saved models
      const response = await apiService.getPopularModels();
      if (response.success && response.data) {
        const models = response.data as string[];
        setPopularModels(models);
        setSelectedModels(models.slice(0, 3)); // Select first 3 by default
      }
    } catch (error) {
      console.error('Error loading models:', error);
      toast({
        variant: "destructive",
        title: "Failed to Load Models",
        description: "Could not fetch available models. Please check your API key."
      });
    }
  };

  useEffect(() => {
    loadPopularModels();
  }, []);

  const handleSaveApiKey = async () => {
    if (!apiKey.trim()) return;
    
    try {
      const response = await apiService.saveApiKey(apiKey);
      if (response.success) {
        setApiKeyStatus(true);
        setShowApiKeyInput(false);
        setApiKey('');
      } else {
        toast({
          variant: "destructive",
          title: "API Key Error",
          description: response.error || "Failed to save API key"
        });
      }
    } catch (error) {
      console.error('Error saving API key:', error);
      toast({
        variant: "destructive",
        title: "Connection Error",
        description: "Failed to save API key. Please try again."
      });
    }
  };

  const handleRunTest = async () => {
    if (!prompt.trim() || selectedModels.length === 0) return;
    
    setIsRunning(true);
    setResults(null);
    
    // Initialize streaming results
    const initialResults: StreamingResult[] = selectedModels.map(model => ({
      model,
      content: '',
      isComplete: false,
      isStreaming: false
    }));
    setStreamingResults(initialResults);
    
    try {
      await apiService.runStreamingSpeedTest({
        prompt: prompt.trim(),
        models: selectedModels
      }, (event: StreamingEvent) => {
        setStreamingResults(prev => {
          const updated = [...prev];
          const modelIndex = updated.findIndex(r => r.model === event.model);
          
          if (modelIndex === -1) return prev;
          
          const current = updated[modelIndex];
          
          switch (event.type) {
            case 'start':
              updated[modelIndex] = {
                ...current,
                isStreaming: true,
                content: '',
                reasoningContent: ''
              };
              break;
              
            case 'chunk':
              if (event.content) {
                updated[modelIndex] = {
                  ...current,
                  content: current.content + event.content
                };
              }
              if (event.reasoningContent) {
                updated[modelIndex] = {
                  ...current,
                  reasoningContent: (current.reasoningContent || '') + event.reasoningContent
                };
              }
              break;
              
            case 'metrics':
              updated[modelIndex] = {
                ...current,
                latency: event.latency,
                tokensPerSecond: event.tokensPerSecond,
                firstTokenTime: event.firstTokenTime,
                tokens: event.totalTokens
              };
              break;
              
            case 'complete':
              updated[modelIndex] = {
                ...current,
                isComplete: true,
                isStreaming: false
              };
              break;
              
            case 'error':
              updated[modelIndex] = {
                ...current,
                error: event.error,
                isComplete: true,
                isStreaming: false
              };
              break;
          }
          
          return updated;
        });
      });
    } catch (error) {
      console.error('Error running streaming speed test:', error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      toast({
        variant: "destructive",
        title: "Speed Test Error",
        description: errorMessage.includes('500') 
          ? "Server error. Please check your API key configuration."
          : errorMessage
      });
    } finally {
      setIsRunning(false);
      
      // Save run history after completion
      if (streamingResults.length > 0) {
        try {
          const historyResults = streamingResults.map(result => ({
            model: result.model,
            content: result.content,
            reasoningContent: result.reasoningContent,
            responseTime: result.responseTime,
            tokens: result.tokens,
            reasoningTokens: result.reasoningTokens,
            latency: result.latency,
            tokensPerSecond: result.tokensPerSecond,
            firstTokenTime: result.firstTokenTime,
            error: result.error
          }));
          
          await apiService.saveRunHistory(prompt.trim(), selectedModels, historyResults);
        } catch (error) {
          console.error('Failed to save run history:', error);
          // Don't show error to user as this is background functionality
        }
      }
    }
  };

  const toggleModelSelection = (modelId: string) => {
    setSelectedModels(prev => {
      if (prev.includes(modelId)) {
        return prev.filter(id => id !== modelId);
      } else {
        if (prev.length >= 3) {
          return prev; // Limit to 3 models
        }
        return [...prev, modelId];
      }
    });
  };



  return (
    <div className="h-full flex flex-col">

      {/* API Key Setup - Centered */}
      {showApiKeyInput && (
        <div className="flex-1 flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center pb-4">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Settings className="h-5 w-5 text-primary" />
              </div>
              <CardTitle className="text-xl">Connect API Key</CardTitle>
              <CardDescription className="text-sm">
                Enter your OpenRouter API key to start benchmarking
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Input
                  type="password"
                  placeholder="sk-or-v1-..."
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="font-mono text-sm"
                />
              </div>
              <Button 
                onClick={handleSaveApiKey} 
                disabled={!apiKey.trim()}
                className="w-full"
              >
                <Zap className="mr-2 h-4 w-4" />
                Connect
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main Interface - Split Layout */}
      {!showApiKeyInput && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Top Model Selection Panel */}
          <div className="flex-shrink-0 border-b bg-muted/30">
            <div className="p-4">
              {/* Model Selection - Horizontal */}
              <div className="relative">
                {/* Usage Guidance - Always visible */}
                <div className="absolute -top-12 left-1/2 transform -translate-x-1/2 z-10">
                  <div className="bg-primary text-primary-foreground px-3 py-1 rounded-lg text-sm font-medium animate-bounce">
                    Select 3 LLMs here
                  </div>
                  <div className="flex justify-center mt-1">
                    <ArrowDown className="h-4 w-4 text-primary animate-bounce" style={{ animationDelay: '0.1s' }} />
                  </div>
                </div>
                
                <div className="flex items-center space-x-2 overflow-x-auto pb-2">
                  {popularModels.slice(0, 8).map((model) => {
                    const isSelected = selectedModels.includes(model);
                    // Handle format: openrouter/provider/model or provider/model
                    const parts = model.split('/');
                    let provider, modelName;
                    if (parts.length === 3) {
                      // Format: openrouter/provider/model - skip the router part
                      provider = parts[1];
                      modelName = parts[2];
                    } else {
                      // Format: provider/model
                      provider = parts[0];
                      modelName = parts[1] || parts[0];
                    }
                    const isDisabled = selectedModels.length >= 3 && !isSelected;
                    
                    return (
                      <button
                        key={model}
                        className={`flex-shrink-0 px-4 py-3 rounded-xl border text-sm transition-all duration-200 transform hover:scale-105 ${
                          isSelected 
                            ? 'bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/25' 
                            : isDisabled
                            ? 'opacity-50 cursor-not-allowed border-muted-foreground/20'
                            : 'hover:bg-muted border-muted-foreground/30 hover:border-primary/50 hover:shadow-md'
                        }`}
                        onClick={() => !isDisabled && toggleModelSelection(model)}
                      >
                        <div className="text-center">
                          <div className="font-semibold">{modelName}</div>
                          <div className="text-xs opacity-70 mt-1">{provider}</div>
                          {isSelected && (
                            <div className="mt-1">
                              <CheckCircle2 className="h-3 w-3 mx-auto" />
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Results Area - Full Height */}
          <div className="flex-1 min-h-0 overflow-hidden">
            {(isRunning || streamingResults.length > 0) ? (
              <div className="h-full min-h-0 grid grid-cols-1 lg:grid-cols-3 gap-1">
                {selectedModels.slice(0, 3).map((model, index) => {
                  const streamResult = streamingResults.find(r => r.model === model);
                  const [provider, modelName] = model.split('/');
                  const isComplete = streamResult?.isComplete || false;
                  const hasError = streamResult?.error;
                  
                  return (
                    <div 
                      key={model}
                      className={`h-full min-h-0 flex flex-col border-r last:border-r-0 transition-all ${
                        isComplete && !hasError
                          ? 'bg-green-50/50 dark:bg-green-950/10'
                          : hasError
                          ? 'bg-red-50/50 dark:bg-red-950/10'
                          : 'bg-background'
                      }`}
                    >
                      {/* Model Header */}
                      <div className="flex-shrink-0 p-3 border-b bg-muted/30">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <span className="font-medium text-sm">{modelName}</span>
                            {streamResult?.isStreaming && (
                              <Loader2 className="h-3 w-3 animate-spin text-primary" />
                            )}
                            {isComplete && !hasError && (
                              <CheckCircle2 className="h-3 w-3 text-green-500" />
                            )}
                            {hasError && (
                              <AlertCircle className="h-3 w-3 text-red-500" />
                            )}
                          </div>
                          <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                            <Badge variant="outline" className="text-xs px-1">
                              {provider}
                            </Badge>
                            {streamResult?.latency && (
                              <span className="flex items-center space-x-1" title="Latency to first token">
                                <Clock className="h-2.5 w-2.5" />
                                <span className="font-mono">
                                  {streamResult.latency}ms
                                </span>
                              </span>
                            )}
                            {streamResult?.tokensPerSecond && (
                              <span className="flex items-center space-x-1" title="Tokens per second">
                                <Activity className="h-2.5 w-2.5" />
                                <span className="font-mono">
                                  {streamResult.tokensPerSecond.toFixed(1)}/s
                                </span>
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Content Area with Fixed Height and Scrolling */}
                      <div className="flex-1 min-h-0 flex flex-col">
                        {hasError ? (
                          <div className="flex-1 p-4 flex items-center justify-center">
                            <Alert variant="destructive" className="w-full">
                              <AlertCircle className="h-4 w-4" />
                              <AlertDescription className="text-sm">{streamResult?.error}</AlertDescription>
                            </Alert>
                          </div>
                        ) : (
                          <div className="flex-1 min-h-0 overflow-y-auto p-4 text-sm leading-relaxed space-y-3 scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent">
                            {streamResult?.reasoningContent && (
                              <div className="p-3 bg-blue-50/50 dark:bg-blue-950/20 rounded-md border-l-2 border-blue-400">
                                <div className="flex items-center space-x-2 mb-2">
                                  <div className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                                  <span className="text-xs font-medium text-blue-700 dark:text-blue-300">REASONING</span>
                                </div>
                                <div className="text-xs text-muted-foreground whitespace-pre-wrap font-mono">
                                  {streamResult.reasoningContent}
                                  {streamResult?.isStreaming && (
                                    <span className="inline-block w-0.5 h-3 bg-blue-500 animate-pulse ml-1" />
                                  )}
                                </div>
                              </div>
                            )}
                            
                            {streamResult?.content ? (
                              <div>
                                {streamResult.reasoningContent && (
                                  <div className="flex items-center space-x-2 mb-2">
                                    <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
                                    <span className="text-xs font-medium text-green-700 dark:text-green-300">ANSWER</span>
                                  </div>
                                )}
                                <div className="whitespace-pre-wrap">
                                  {streamResult.content}
                                  {streamResult?.isStreaming && (
                                    <span className="inline-block w-0.5 h-4 bg-primary animate-pulse ml-1" />
                                  )}
                                </div>
                              </div>
                            ) : streamResult?.isStreaming ? (
                              <div className="flex items-center justify-center h-32 text-muted-foreground">
                                <div className="flex items-center space-x-2">
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  <span className="text-sm">Generating...</span>
                                </div>
                              </div>
                            ) : isRunning ? (
                              <div className="flex items-center justify-center h-32 text-muted-foreground">
                                <div className="flex items-center space-x-2">
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  <span className="text-sm">Starting...</span>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center justify-center h-32 text-muted-foreground">
                                <div className="text-center">
                                  <Cpu className="h-6 w-6 mx-auto mb-2 opacity-50" />
                                  <p className="text-sm">Ready</p>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                        
                        {/* Footer Stats - Always Visible and Fixed */}
                        <div className="flex-shrink-0 border-t p-2 bg-muted/20">
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <div className="space-y-1">
                              {streamResult?.tokens ? (
                                <div>Tokens: {streamResult.tokens}</div>
                              ) : (
                                <div>Tokens: -</div>
                              )}
                              {streamResult?.reasoningTokens && (
                                <div className="text-blue-600 dark:text-blue-400">
                                  Reasoning: {streamResult.reasoningTokens}
                                </div>
                              )}
                              {streamResult?.tokensPerSecond ? (
                                <div className="text-green-600 dark:text-green-400">
                                  Speed: {streamResult.tokensPerSecond.toFixed(1)} tok/s
                                </div>
                              ) : (
                                <div>Speed: -</div>
                              )}
                              {streamResult?.latency ? (
                                <div className="text-orange-600 dark:text-orange-400">
                                  Latency: {streamResult.latency}ms
                                </div>
                              ) : (
                                <div>Latency: -</div>
                              )}
                            </div>
                            {isComplete && (
                              <CheckCircle2 className="h-3 w-3 text-green-500" />
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <TrendingUp className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium">Ready to Benchmark</p>
                  <p className="text-sm">Select models and run a test to see live results</p>
                </div>
              </div>
            )}
          </div>

          {/* Bottom Prompt Panel */}
          <div className="flex-shrink-0 border-t bg-muted/30">
            <div className="p-4 space-y-4">
              {/* Prompt Input with Preset Selection */}
              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" className="w-64 justify-between">
                        <span className="truncate">Choose a programming prompt</span>
                        <ArrowDown className="ml-2 h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-80 max-h-96 overflow-y-auto">
                      {Object.entries(PROGRAMMING_PROMPTS).map(([category, { icon: Icon, prompts }]) => (
                        <div key={category}>
                          <DropdownMenuLabel className="flex items-center">
                            <Icon className="mr-2 h-4 w-4" />
                            {category}
                          </DropdownMenuLabel>
                          {prompts.map((promptText, index) => (
                            <DropdownMenuItem 
                              key={`${category}-${index}`} 
                              onClick={() => setPrompt(promptText)}
                              className="pl-8"
                            >
                              <div className="text-sm">
                                {promptText.length > 60 ? `${promptText.substring(0, 60)}...` : promptText}
                              </div>
                            </DropdownMenuItem>
                          ))}
                          <DropdownMenuSeparator />
                        </div>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const randomPrompt = ALL_PROMPTS[Math.floor(Math.random() * ALL_PROMPTS.length)];
                      setPrompt(randomPrompt);
                    }}
                  >
                    <Sparkles className="mr-1 h-3 w-3" />
                    Random
                  </Button>
                  {onShowDashboard && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={onShowDashboard}
                    >
                      <BarChart3 className="mr-1 h-3 w-3" />
                      Dashboard
                    </Button>
                  )}
                </div>
                
                <div className="flex items-center space-x-4">
                  <Textarea
                    placeholder="Enter your test prompt or select one from the dropdown above..."
                    value={prompt}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setPrompt(e.target.value)}
                    className="flex-1 min-h-[80px] resize-none text-sm"
                    maxLength={2000}
                  />
                  <div className="flex flex-col items-center space-y-2">
                    <Button
                      onClick={handleRunTest}
                      disabled={!prompt.trim() || selectedModels.length === 0 || isRunning}
                      size="lg"
                      className="w-36 h-12 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105 font-semibold"
                    >
                      {isRunning ? (
                        <>
                          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                          Running...
                        </>
                      ) : (
                        <>
                          <Play className="mr-2 h-5 w-5" />
                          Run Test
                        </>
                      )}
                    </Button>
                    <div className="text-xs text-muted-foreground text-center">
                      {selectedModels.length}/3 models
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}