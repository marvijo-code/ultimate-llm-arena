import { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Play, CheckCircle2, AlertCircle, GitBranch, Terminal, Clock, RotateCcw, ChevronDown, ChevronUp, Trophy, Users } from 'lucide-react';
import { apiService, type CodingTool, type RepoTestProgressEvent, type RepoTestResult, type RepoTestHistoryEntry, type OpenRouterFreeModel, type BatchLeaderboardEntry, type BatchProgressEvent } from '@/services/api';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Props { onBack?: () => void }

// Fallback free models if API fails
const FALLBACK_MODELS: OpenRouterFreeModel[] = [
  { id: "deepseek/deepseek-r1-0528:free", name: "DeepSeek R1", provider: "DeepSeek" },
  { id: "qwen/qwen3-coder:free", name: "Qwen 3 Coder", provider: "Qwen" },
  { id: "openai/gpt-oss-120b:free", name: "GPT-OSS 120B", provider: "OpenAI" },
  { id: "openai/gpt-oss-20b:free", name: "GPT-OSS 20B", provider: "OpenAI" },
  { id: "qwen/qwen3-next-80b-a3b-instruct:free", name: "Qwen 3 Next 80B", provider: "Qwen" },
  { id: "mistralai/mistral-small-3.1-24b-instruct:free", name: "Mistral Small 3.1 24B", provider: "Mistral" },
  { id: "google/gemma-3-27b-it:free", name: "Gemma 3 27B", provider: "Google" },
  { id: "meta-llama/llama-3.3-70b-instruct:free", name: "Llama 3.3 70B", provider: "Meta" },
  { id: "nvidia/nemotron-3-nano-30b-a3b:free", name: "Nemotron 3 Nano 30B", provider: "NVIDIA" },
  { id: "nousresearch/hermes-3-llama-3.1-405b:free", name: "Hermes 3 405B", provider: "NousResearch" },
];

export default function RepoTestArena({ onBack }: Props) {
  const { toast } = useToast();

  // Form state
  const [repoUrl, setRepoUrl] = useState('');
  const [ref, setRef] = useState('main');
  const [prompt, setPrompt] = useState('');
  const [testCommand, setTestCommand] = useState('npm test');
  const [selectedTool, setSelectedTool] = useState('openrouter-direct');
  const [selectedModels, setSelectedModels] = useState<string[]>([FALLBACK_MODELS[0].id]);
  const [customModel, setCustomModel] = useState('');

  // Run state
  const [isRunning, setIsRunning] = useState(false);
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [progressLog, setProgressLog] = useState<(RepoTestProgressEvent | BatchProgressEvent)[]>([]);
  const [result, setResult] = useState<RepoTestResult | null>(null);
  const [batchLeaderboard, setBatchLeaderboard] = useState<BatchLeaderboardEntry[] | null>(null);

  // History state
  const [history, setHistory] = useState<RepoTestHistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // Tools and models
  const [tools, setTools] = useState<CodingTool[]>([]);
  const [availableModels, setAvailableModels] = useState<OpenRouterFreeModel[]>(FALLBACK_MODELS);
  const [modelsLoading, setModelsLoading] = useState(true);

  // Expanded iteration details
  const [expandedIteration, setExpandedIteration] = useState<number | null>(null);

  // Fetch tools and models on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await apiService.getRepoTestTools();
        const data = (res as any).data ?? res;
        if (Array.isArray(data)) setTools(data);
      } catch { /* ignore */ }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setModelsLoading(true);
        const models = await apiService.getRepoTestModels();
        if (models.length > 0) {
          setAvailableModels(models);
          // Keep first model selected if current selection not in new list
          if (!models.some(m => m.id === selectedModels[0])) {
            setSelectedModels([models[0].id]);
          }
        }
      } catch (err) {
        console.log('Failed to fetch models, using fallback:', err);
      } finally {
        setModelsLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (showHistory) loadHistory();
  }, [showHistory]);

  const loadHistory = async () => {
    try {
      const res = await apiService.getRepoTestHistory(20);
      const data = (res as any).data ?? res;
      if (Array.isArray(data)) setHistory(data);
    } catch { /* ignore */ }
  };

  const toggleModelSelection = (modelId: string) => {
    setSelectedModels(prev => {
      if (prev.includes(modelId)) {
        // Don't uncheck if it's the last one
        if (prev.length === 1) return prev;
        return prev.filter(id => id !== modelId);
      }
      return [...prev, modelId];
    });
  };

  const handleRun = async () => {
    if (!repoUrl.trim()) {
      toast({ variant: 'destructive', title: 'Missing repo URL' });
      return;
    }
    if (!prompt.trim()) {
      toast({ variant: 'destructive', title: 'Missing prompt', description: 'Describe the task for the AI coding tool.' });
      return;
    }
    if (!testCommand.trim()) {
      toast({ variant: 'destructive', title: 'Missing test command', description: 'Specify how to run the test suite.' });
      return;
    }

    setIsRunning(true);
    setProgressLog([]);
    setResult(null);
    setBatchLeaderboard(null);
    setExpandedIteration(null);

    try {
      if (isBatchMode && selectedModels.length > 1) {
        await runBatch();
      } else {
        await runSingle();
      }
    } catch (error) {
      toast({ variant: 'destructive', title: 'Run failed', description: (error as Error).message });
    } finally {
      setIsRunning(false);
    }
  };

  const runSingle = async () => {
    const model = customModel.trim() || selectedModels[0];

    await apiService.runRepoTestStream(
      { repo_url: repoUrl, ref, prompt, test_command: testCommand, tool: selectedTool, model },
      (event) => {
        setProgressLog(prev => [...prev, event]);
        if (event.type === 'complete' && event.data) {
          setResult(event.data as RepoTestResult);
        }
        if (event.type === 'error') {
          toast({ variant: 'destructive', title: 'Run failed', description: event.message });
        }
      },
    );
  };

  const runBatch = async () => {
    const models = customModel.trim() ? [customModel.trim(), ...selectedModels] : selectedModels;

    await apiService.runRepoTestBatch(
      { repo_url: repoUrl, ref, prompt, test_command: testCommand, tool: selectedTool, models },
      (event) => {
        setProgressLog(prev => [...prev, event]);
        
        if (event.type === 'batch_complete' && event.data?.leaderboard) {
          setBatchLeaderboard(event.data.leaderboard as BatchLeaderboardEntry[]);
        }
        
        if (event.type === 'model_complete' && event.data?.result) {
          // Show individual results in progress log
          const modelResult = event.data.result as RepoTestResult;
          if (!result) {
            setResult(modelResult); // Show first model's details
          }
        }
        
        if (event.type === 'error') {
          toast({ variant: 'destructive', title: 'Batch error', description: event.message });
        }
      },
    );
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'success': return 'text-green-500';
      case 'partial': return 'text-yellow-500';
      case 'fail': return 'text-red-500';
      case 'error': return 'text-red-500';
      case 'running': return 'text-blue-500';
      default: return 'text-muted-foreground';
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case 'success': return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">PASS</Badge>;
      case 'partial': return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">PARTIAL</Badge>;
      case 'fail': return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">FAIL</Badge>;
      case 'error': return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">ERROR</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  // Group models by provider
  const modelsByProvider = availableModels.reduce((acc, model) => {
    if (!acc[model.provider]) acc[model.provider] = [];
    acc[model.provider].push(model);
    return acc;
  }, {} as Record<string, OpenRouterFreeModel[]>);

  return (
    <div className="h-full flex flex-col p-4 space-y-4 overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">Repo Test Arena</h2>
          <p className="text-sm text-muted-foreground">
            Polyglot-style benchmark: clone a repo, run an AI coding tool, execute tests. 2 iterations max. Tests are never revealed to models.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowHistory(!showHistory)}>
            {showHistory ? 'Hide' : 'Show'} History
          </Button>
          {onBack && <Button variant="outline" onClick={onBack}>Back</Button>}
        </div>
      </div>

      {/* Setup Card */}
      <Card>
        <CardHeader>
          <CardTitle>Setup</CardTitle>
          <CardDescription>Configure the repository, AI tool, model, and test command</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Row 1: Repo + Ref */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-3">
              <label className="text-sm font-medium flex items-center gap-1"><GitBranch className="h-3.5 w-3.5" /> Repository URL</label>
              <Input
                className="mt-1"
                placeholder="https://github.com/user/repo.git"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">SHA / Branch / Tag</label>
              <Input
                className="mt-1"
                placeholder="main"
                value={ref}
                onChange={(e) => setRef(e.target.value)}
              />
            </div>
          </div>

          {/* Row 2: Prompt */}
          <div>
            <label className="text-sm font-medium">Prompt (task description - tests NOT included)</label>
            <textarea
              className="mt-1 w-full min-h-[100px] border rounded-md bg-background p-3 text-sm resize-y"
              placeholder="Describe the coding task. The model will NOT see the test source code - only this prompt. On a second attempt, it will see test failure output."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </div>

          {/* Row 3: Tool + Models + Test Command */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium flex items-center gap-1"><Terminal className="h-3.5 w-3.5" /> AI Coding Tool</label>
              <select
                className="mt-1 w-full border rounded-md bg-background p-2 text-sm"
                value={selectedTool}
                onChange={(e) => setSelectedTool(e.target.value)}
              >
                {tools.length > 0 ? tools.map(t => (
                  <option 
                    key={t.id} 
                    value={t.id}
                    disabled={!t.available}
                  >
                    {t.name} - {t.description} {!t.available ? '(not installed)' : t.apiKeyEnvVar && !t.apiKeyConfigured ? '(API key needed)' : ''}
                  </option>
                )) : (
                  <>
                    <option value="openrouter-direct">OpenRouter Direct - API call (no CLI needed)</option>
                    <option value="aider">Aider - AI pair programming</option>
                    <option value="opencode">OpenCode - Open-source coding agent</option>
                    <option value="claude-code">Claude Code - Anthropic CLI</option>
                    <option value="copilot-cli">Copilot CLI - GitHub Copilot</option>
                  </>
                )}
              </select>
              {tools.length > 0 && selectedTool && tools.find(t => t.id === selectedTool)?.apiKeyEnvVar && !tools.find(t => t.id === selectedTool)?.apiKeyConfigured && (
                <div className="text-xs text-amber-500 mt-1">
                  ⚠️ {tools.find(t => t.id === selectedTool)?.apiKeyEnvVar} not configured
                </div>
              )}
            </div>
            <div>
              <label className="text-sm font-medium flex items-center gap-1"><Users className="h-3.5 w-3.5" /> Models {modelsLoading && <Loader2 className="h-3 w-3 animate-spin" />}</label>
              
              {/* Batch mode toggle */}
              <div className="flex items-center gap-2 mt-1 mb-2">
                <Checkbox
                  id="batchMode"
                  checked={isBatchMode}
                  onCheckedChange={(checked) => setIsBatchMode(checked as boolean)}
                />
                <label htmlFor="batchMode" className="text-xs cursor-pointer">Compare multiple models</label>
              </div>

              {/* Model selection */}
              <ScrollArea className="h-[150px] border rounded-md p-2">
                {Object.entries(modelsByProvider).map(([provider, models]) => (
                  <div key={provider} className="mb-2">
                    <div className="text-xs font-semibold text-muted-foreground mb-1">{provider}</div>
                    {models.map(m => (
                      <div key={m.id} className="flex items-center gap-2 py-0.5">
                        <Checkbox
                          id={m.id}
                          checked={selectedModels.includes(m.id)}
                          onCheckedChange={() => toggleModelSelection(m.id)}
                        />
                        <label htmlFor={m.id} className="text-xs cursor-pointer truncate">{m.name}</label>
                      </div>
                    ))}
                  </div>
                ))}
              </ScrollArea>

              <Input
                className="mt-1"
                placeholder="Or enter custom model ID..."
                value={customModel}
                onChange={(e) => setCustomModel(e.target.value)}
              />
              <div className="text-xs text-muted-foreground mt-1">
                {isBatchMode ? `${selectedModels.length} model(s) selected` : 'Select one or more models'}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Test Command</label>
              <Input
                className="mt-1"
                placeholder="npm test"
                value={testCommand}
                onChange={(e) => setTestCommand(e.target.value)}
              />
              <div className="text-xs text-muted-foreground mt-1">e.g. npm test, pytest, deno test, cargo test, go test ./...</div>
            </div>
          </div>

          {/* Run button */}
          <div className="flex items-center gap-3">
            <Button onClick={handleRun} disabled={isRunning} className="min-w-[180px]">
              {isRunning ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Running...</>
              ) : (
                <><Play className="mr-2 h-4 w-4" />{isBatchMode ? `Run Batch (${selectedModels.length})` : 'Run Benchmark'}</>
              )}
            </Button>
            <div className="text-xs text-muted-foreground">
              Max 2 iterations. Iteration 1: prompt only. Iteration 2: prompt + test failure output (no test source code).
              {isBatchMode && ' Batch mode runs all selected models in parallel.'}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Progress Log */}
      {progressLog.length > 0 && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Terminal className="h-4 w-4" />
              Progress
              {isRunning && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[200px]">
              <div className="p-4 font-mono text-xs space-y-1">
                {progressLog.map((event, i) => (
                  <div key={i} className={`flex items-start gap-2 ${
                    event.type === 'error' || event.type === 'model_error' ? 'text-red-400' :
                    event.type === 'complete' || event.type === 'batch_complete' ? 'text-green-400' :
                    event.type === 'test_result' || event.type === 'model_complete' ? 'text-yellow-400' :
                    'text-muted-foreground'
                  }`}>
                    <span className="text-muted-foreground/50 select-none w-6 text-right shrink-0">{i + 1}</span>
                    <span className="uppercase font-semibold w-20 shrink-0">[{event.type}]</span>
                    <span>{event.message}</span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Batch Leaderboard */}
      {batchLeaderboard && batchLeaderboard.length > 0 && (
        <Card className="border-purple-500/40">
          <CardHeader className="py-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Trophy className="h-5 w-5 text-yellow-500" />
              Batch Results Leaderboard
              <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30">{batchLeaderboard.length} models</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {batchLeaderboard.map((entry, idx) => (
                <div key={entry.model} className={`flex items-center justify-between p-3 rounded-lg border ${
                  idx === 0 ? 'bg-yellow-500/10 border-yellow-500/30' :
                  idx === 1 ? 'bg-slate-400/10 border-slate-400/30' :
                  idx === 2 ? 'bg-orange-600/10 border-orange-600/30' :
                  'bg-muted/30'
                }`}>
                  <div className="flex items-center gap-4">
                    <div className="text-lg font-bold w-8 text-center">
                      {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1}
                    </div>
                    <div>
                      <div className="font-medium text-sm">{entry.model}</div>
                      <div className="text-xs text-muted-foreground">
                        {entry.iterations} iteration{entry.iterations !== 1 ? 's' : ''} • {(entry.duration_ms / 1000).toFixed(1)}s
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className={`text-lg font-bold ${
                        entry.status === 'success' ? 'text-green-400' :
                        entry.status === 'partial' ? 'text-yellow-400' :
                        'text-red-400'
                      }`}>
                        {entry.tests_passed}/{entry.tests_total}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {entry.tests_total > 0 ? ((entry.tests_passed / entry.tests_total) * 100).toFixed(0) : 0}% pass rate
                      </div>
                    </div>
                    {statusBadge(entry.status)}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Single Run Results */}
      {result && !batchLeaderboard && (
        <Card className={`border ${
          result.status === 'success' ? 'border-green-500/40' :
          result.status === 'partial' ? 'border-yellow-500/40' :
          'border-red-500/40'
        }`}>
          <CardHeader className="py-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                {result.status === 'success' ? <CheckCircle2 className="h-5 w-5 text-green-500" /> :
                 result.status === 'partial' ? <AlertCircle className="h-5 w-5 text-yellow-500" /> :
                 <AlertCircle className="h-5 w-5 text-red-500" />}
                Result
                {statusBadge(result.status)}
              </CardTitle>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{(result.total_duration_ms / 1000).toFixed(1)}s total</span>
                <span className="flex items-center gap-1"><RotateCcw className="h-3.5 w-3.5" />{result.iterations.length} iteration(s)</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
              <div>
                <div className="text-muted-foreground">Tests Passed</div>
                <div className="text-2xl font-bold">{result.final_tests_passed}<span className="text-muted-foreground text-base">/{result.final_tests_total}</span></div>
              </div>
              <div>
                <div className="text-muted-foreground">Tests Failed</div>
                <div className="text-2xl font-bold text-red-400">{result.final_tests_failed}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Clone Time</div>
                <div className="text-lg font-semibold">{(result.clone_duration_ms / 1000).toFixed(1)}s</div>
              </div>
              <div>
                <div className="text-muted-foreground">Tool</div>
                <div className="text-lg font-semibold">{result.tool}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Model</div>
                <div className="text-sm font-semibold break-all">{result.model}</div>
              </div>
            </div>

            {/* Iterations */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Iterations</h4>
              {result.iterations.map((iter) => (
                <Card key={iter.iteration} className="bg-muted/30">
                  <button
                    className="w-full text-left p-3 flex items-center justify-between"
                    onClick={() => setExpandedIteration(expandedIteration === iter.iteration ? null : iter.iteration)}
                  >
                    <div className="flex items-center gap-3">
                      <Badge variant="outline">#{iter.iteration}</Badge>
                      <span className="text-sm">
                        {iter.tests_passed}/{iter.tests_total} passed
                      </span>
                      {iter.test_exit_code === 0 ? (
                        <Badge className="bg-green-500/20 text-green-400 border-green-500/30">PASS</Badge>
                      ) : (
                        <Badge className="bg-red-500/20 text-red-400 border-red-500/30">FAIL</Badge>
                      )}
                      <span className="text-xs text-muted-foreground">{(iter.duration_ms / 1000).toFixed(1)}s</span>
                    </div>
                    {expandedIteration === iter.iteration ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                  {expandedIteration === iter.iteration && (
                    <div className="px-3 pb-3 space-y-2">
                      <div>
                        <div className="text-xs font-medium text-muted-foreground mb-1">Test Output</div>
                        <pre className="text-xs bg-black/40 rounded p-2 overflow-auto max-h-[200px] whitespace-pre-wrap">
                          {iter.test_stdout || iter.test_stderr || '(no output)'}
                        </pre>
                      </div>
                      <div>
                        <div className="text-xs font-medium text-muted-foreground mb-1">Tool Output (truncated)</div>
                        <pre className="text-xs bg-black/40 rounded p-2 overflow-auto max-h-[200px] whitespace-pre-wrap">
                          {iter.tool_output?.substring(0, 3000) || '(no output)'}
                        </pre>
                      </div>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* History */}
      {showHistory && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-base">Run History</CardTitle>
          </CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <div className="text-sm text-muted-foreground">No runs yet.</div>
            ) : (
              <div className="space-y-2">
                {history.map(run => (
                  <div key={run.id} className="flex items-center justify-between p-2 border rounded text-sm">
                    <div className="flex items-center gap-3">
                      {statusBadge(run.status)}
                      <span className="font-mono text-xs">{run.repo_url.replace('https://github.com/', '')}</span>
                      <span className="text-xs text-muted-foreground">@{run.ref}</span>
                      <span className="text-xs text-muted-foreground">{run.tool} / {run.model.split('/').pop()}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{run.tests_passed}/{run.tests_total} tests</span>
                      <span>{run.total_duration_ms ? (run.total_duration_ms / 1000).toFixed(1) + 's' : '-'}</span>
                      <span>{new Date(run.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
