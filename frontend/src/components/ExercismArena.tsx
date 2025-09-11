import { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, Play, CheckCircle2, AlertCircle, Check } from 'lucide-react';
import { apiService, type Exercise, type CodeEvalResult, type LLMModel, type OpenRouterModel } from '@/services/api';
import { useToast } from '@/hooks/use-toast';

interface Props { onBack?: () => void }

export default function ExercismArena({ onBack }: Props) {
  const { toast } = useToast();
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [selectedExercise, setSelectedExercise] = useState<string>('isogram');
  const [testCount, setTestCount] = useState<number>(10);
  const [popularModels, setPopularModels] = useState<string[]>([]);
  const [modelSearch, setModelSearch] = useState('');
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<Record<string, CodeEvalResult | { error: string }>>({});

  useEffect(() => {
    (async () => {
      try {
        const res = await apiService.getExercises();
        const data = (res as any).data ?? res; // support either shape
        setExercises(data as Exercise[]);
        if (!data || (data as Exercise[]).length === 0) setSelectedExercise('isogram');
      } catch (e) {
        // ignore
      }
    })();
  }, []);

  const loadPopularModels = async () => {
    try {
      // Try full model list via API key if configured
      const allResp: any = await apiService.getAvailableModels();
      const allData = (allResp as any).data ?? allResp;
      if (Array.isArray(allData)) {
        const modelIds = allData
          .map((m: any) => (typeof m === 'string' ? m : (m.id || m.model || m.name)))
          .filter((id: any) => typeof id === 'string') as string[];
        if (modelIds.length > 0) {
          setPopularModels(modelIds);
          setSelectedModels(modelIds.slice(0, 3));
          return;
        }
      }
    } catch {}
    try {
      const response = await apiService.getTopModels();
      if (response.success && response.models) {
        const models = response.models.map((m: OpenRouterModel) => m.id);
        setPopularModels(models);
        setSelectedModels(models.slice(0, 3));
        return;
      }
    } catch {}
    try {
      const savedResponse = await apiService.getSavedModels();
      if (savedResponse.success && savedResponse.data?.models) {
        const saved = savedResponse.data.models.filter((m: LLMModel) => m.is_active)
          .map((m: LLMModel) => `${m.provider_name}/${m.model_name}`);
        if (saved.length > 0) {
          setPopularModels(saved);
          setSelectedModels(saved.slice(0, 3));
          return;
        }
      }
    } catch {}
    try {
      const popularResponse = await apiService.getPopularModels();
      if (popularResponse.success && popularResponse.data) {
        const models = popularResponse.data as string[];
        setPopularModels(models);
        setSelectedModels(models.slice(0, 3));
      }
    } catch (error) {
      console.error('Model load error', error);
      toast({ variant: 'destructive', title: 'Failed to load models' });
    }
  };

  useEffect(() => { loadPopularModels(); }, []);

  const toggleModelSelection = (modelId: string) => {
    setSelectedModels(prev => {
      if (prev.includes(modelId)) return prev.filter(id => id !== modelId);
      if (prev.length >= 3) return prev;
      return [...prev, modelId];
    });
  };

  const handleRun = async () => {
    if (!selectedExercise || selectedModels.length === 0) return;
    setIsRunning(true);
    setResults({});
    try {
      const response = await apiService.runExercism(selectedExercise, selectedModels, testCount);
      const data = (response as any).data ?? response;
      const map: Record<string, CodeEvalResult> = {};
      for (const r of data.results as CodeEvalResult[]) {
        map[r.model] = r;
      }
      setResults(map);
    } catch (error) {
      console.error(error);
      toast({ variant: 'destructive', title: 'Run failed', description: (error as Error).message });
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="h-full flex flex-col p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">Exercism Programming Tests</h2>
          <p className="text-sm text-muted-foreground">Default 10 tests will run per model. Tests remain hidden from models; only task prompt is sent.</p>
        </div>
        {onBack && (
          <Button variant="outline" onClick={onBack}>Back</Button>
        )}
      </div>

      <Card id="exercism-setup-card" className="exercism-setup-card">
        <CardHeader>
          <CardTitle>Setup</CardTitle>
          <CardDescription>Select exercise, number of tests, and up to 3 models</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium">Exercise</label>
              <select
                id="exercism-exercise-select"
                className="mt-2 w-full border rounded-md bg-background p-2 exercism-exercise-select"
                value={selectedExercise}
                onChange={(e) => setSelectedExercise(e.target.value)}
              >
                {exercises.map(ex => (
                  <option key={ex.id} value={ex.id}>{ex.name} ({ex.language})</option>
                ))}
                {exercises.length === 0 && (
                  <option value="isogram">Isogram (javascript)</option>
                )}
              </select>
              <div className="text-xs text-muted-foreground mt-1">
                Total tests available: {exercises.find(e => e.id === selectedExercise)?.totalTests ?? 'N/A'}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Number of tests</label>
              <Input id="exercism-test-count-input" type="number" min={1} max={50} value={testCount} onChange={(e) => setTestCount(parseInt(e.target.value || '10', 10))} className="mt-2" />
              <div className="text-xs text-muted-foreground mt-1">Default 10</div>
            </div>
            <div>
              <label className="text-sm font-medium">Models</label>
              <div className="mt-2 flex items-center gap-2">
                <Input
                  id="exercism-model-search"
                  placeholder="Search models (provider/model)..."
                  value={modelSearch}
                  onChange={(e) => setModelSearch(e.target.value)}
                  className="w-72 exercism-model-search"
                />
              </div>
              <div className="mt-2 flex items-center gap-2 overflow-x-auto py-1">
                {popularModels
                  .filter((m) => m.toLowerCase().includes(modelSearch.toLowerCase()))
                  .map(model => {
                    const selected = selectedModels.includes(model);
                    const parts = model.split('/');
                    const provider = parts.length === 3 ? parts[1] : parts[0];
                    const modelName = parts.length === 3 ? parts[2] : parts[1] || parts[0];
                    const isDisabled = selectedModels.length >= 3 && !selected;
                    return (
                      <button
                        key={model}
                        id={`exercism-model-chip-${model.replace(/[^a-z0-9-]/gi, '_')}`}
                        data-model={model}
                        aria-pressed={selected}
                        onClick={() => !isDisabled && toggleModelSelection(model)}
                        className={`px-3 py-2 text-sm rounded-md border ${selected ? 'bg-primary text-primary-foreground border-primary exercism-model-chip exercism-model-chip--selected' : isDisabled ? 'opacity-50 cursor-not-allowed exercism-model-chip' : 'exercism-model-chip'}`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{modelName}</span>
                          <Badge variant="outline">{provider}</Badge>{selected && (<span className="inline-flex items-center justify-center h-4 w-4 rounded-sm bg-green-500 border border-green-600 text-white exercism-model-checkbox"><Check className="h-3 w-3" /></span>)}
                        </div>
                      </button>
                    );
                  })}
              </div>
              <div className="text-xs text-muted-foreground mt-1">{selectedModels.length}/3 selected</div>
            </div>
          </div>
          <div>
            <Button id="exercism-run-button" onClick={handleRun} disabled={isRunning || selectedModels.length === 0}>
              {isRunning ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/>Running...</> : <><Play className="mr-2 h-4 w-4"/>Run Tests</>}
            </Button>
          </div>
        </CardContent>
      </Card>

      {selectedModels.length > 0 && (
        <div id="exercism-results-grid" className="grid grid-cols-1 lg:grid-cols-3 gap-4 exercism-results-grid">
          {selectedModels.map(model => {
            const r = results[model] as CodeEvalResult | undefined;
            const hasError = (r as any)?.error || r?.compileError;
            return (
              <Card key={model} id={`exercism-result-card-${model.replace(/[^a-z0-9-]/gi, '_')}`} data-model={model} className={`border-white exercism-result-card ${hasError ? 'border-red-500/40' : ''}`}>
                <CardHeader>
                  <CardTitle className="text-base">{model}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {r ? (
                    <>
                      {r.compileError ? (
                        <div className="flex items-start gap-2 text-red-500"><AlertCircle className="h-4 w-4"/><span>Compile error: {r.compileError.split('\n')[0]}</span></div>
                      ) : (
                        <div className="flex items-center gap-2 text-green-600"><CheckCircle2 className="h-4 w-4"/><span>Compiled</span></div>
                      )}
                      <div className="grid grid-cols-2 gap-2">
                        <div>Tests: {r.testsPassed}/{r.testsTotal}</div>
                        <div>Score: {r.score}</div>
                        <div>Lint warnings: {r.lintWarnings}</div>
                        <div>Lint errors: {r.lintErrors}</div>
                      </div>
                    </>
                  ) : isRunning ? (
                    <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin"/>Running...</div>
                  ) : (
                    <div className="text-muted-foreground">No result</div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

