import { useState, useEffect } from 'react';
import { Search, Plus, Loader2, ExternalLink, Settings, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Label } from './ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Switch } from './ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

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

interface ProviderModel {
  id: string;
  name?: string;
  display_name?: string;
  description?: string;
  context_length?: number;
  max_output_tokens?: number;
  pricing?: {
    prompt?: number;
    completion?: number;
  };
}

const LLMManagement: React.FC = () => {
  const [providers, setProviders] = useState<LLMProvider[]>([]);
  const [models, setModels] = useState<LLMModel[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<LLMProvider | null>(null);
  const [providerModels, setProviderModels] = useState<ProviderModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [modelSearchTerm, setModelSearchTerm] = useState('');
  const [apiKey, setApiKey] = useState('');

  // API base URL - use environment variable or default to backend port
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

  // Load providers on component mount
  useEffect(() => {
    loadProviders();
    loadModels();
  }, []);

  const loadProviders = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/llm/providers`);
      const data = await response.json();
      setProviders(data.providers || []);
    } catch (error) {
      console.error('Error loading providers:', error);
      toast.error(`Failed to load providers: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const loadModels = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/llm/models`);
      const data = await response.json();
      setModels(data.models || []);
    } catch (error) {
      console.error('Error loading models:', error);
      toast.error(`Failed to load models: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleProviderChange = (providerName: string) => {
    const provider = providers.find(p => p.name === providerName);
    setSelectedProvider(provider || null);
    setProviderModels([]);
    setModelSearchTerm('');
    setApiKey('');
  };

  const loadProviderModels = async (provider: LLMProvider) => {
    if (!provider) return;
    
    setLoading(true);
    try {
      const url = provider.api_key_required && apiKey 
        ? `${API_BASE_URL}/api/llm/providers/${provider.name}/models?apiKey=${encodeURIComponent(apiKey)}`
        : `${API_BASE_URL}/api/llm/providers/${provider.name}/models`;
        
      const response = await fetch(url);
      const data = await response.json();
      
      if (response.ok) {
        setProviderModels(data.models || []);
        toast.success(`Loaded ${data.models?.length || 0} models from ${provider.display_name}`);
      } else {
        throw new Error(data.error || 'Failed to fetch models');
      }
    } catch (error) {
      console.error('Error loading provider models:', error);
      toast.error(`Failed to load models: ${error.message}`);
      setProviderModels([]);
    } finally {
      setLoading(false);
    }
  };

  const addModelToDatabase = async (providerModel: ProviderModel) => {
    if (!selectedProvider) return;

    try {
      const modelData: Omit<LLMModel, "id" | "created_at"> = {
        provider_id: selectedProvider.id,
        model_id: providerModel.id,
        display_name: providerModel.display_name || providerModel.name || providerModel.id,
        description: providerModel.description,
        context_length: providerModel.context_length,
        max_output_tokens: providerModel.max_output_tokens,
        input_cost_per_token: providerModel.pricing?.prompt,
        output_cost_per_token: providerModel.pricing?.completion,
        supports_streaming: true, // Default to true, can be edited later
        supports_reasoning: false, // Default to false, can be edited later
        is_active: true
      };

      const response = await fetch(`${API_BASE_URL}/api/llm/models`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(modelData)
      });

      const data = await response.json();
      
      if (response.ok) {
        toast.success(`Added ${modelData.display_name} to database`);
        loadModels(); // Refresh the models list
      } else {
        throw new Error(data.error || 'Failed to add model');
      }
    } catch (error) {
      console.error('Error adding model:', error);
      toast.error(`Failed to add model: ${error.message}`);
    }
  };

  const toggleModelActive = async (model: LLMModel) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/llm/models/${model.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !model.is_active })
      });

      if (response.ok) {
        toast.success(`${model.display_name} ${model.is_active ? 'disabled' : 'enabled'}`);
        loadModels();
      } else {
        throw new Error('Failed to update model');
      }
    } catch (error) {
      console.error('Error updating model:', error);
      toast.error('Failed to update model');
    }
  };

  const deleteModel = async (model: LLMModel) => {
    if (!confirm(`Are you sure you want to delete ${model.display_name}?`)) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/llm/models/${model.id}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        toast.success(`Deleted ${model.display_name}`);
        loadModels();
      } else {
        throw new Error('Failed to delete model');
      }
    } catch (error) {
      console.error('Error deleting model:', error);
      toast.error('Failed to delete model');
    }
  };

  // Filter providers based on search term
  const filteredProviders = providers.filter(provider =>
    provider.display_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    provider.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Filter provider models based on search term
  const filteredProviderModels = providerModels.filter(model =>
    (model.display_name || model.name || model.id).toLowerCase().includes(modelSearchTerm.toLowerCase()) ||
    (model.description || '').toLowerCase().includes(modelSearchTerm.toLowerCase())
  );

  // Get models for selected provider
  const selectedProviderModels = selectedProvider 
    ? models.filter(model => model.provider_id === selectedProvider.id)
    : [];

  return (
    <div id="llm-management" className="container mx-auto p-6 space-y-6 llm-management">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">LLM Management</h1>
          <p className="text-muted-foreground">Manage AI providers and models</p>
        </div>
      </div>

      <Tabs defaultValue="browse" className="space-y-6">
        <TabsList>
          <TabsTrigger value="browse">Browse & Add Models</TabsTrigger>
          <TabsTrigger value="manage">Manage Saved Models</TabsTrigger>
        </TabsList>

        <TabsContent value="browse" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Provider Selection Column */}
            <Card>
              <CardHeader>
                <CardTitle>Select LLM Provider</CardTitle>
                <CardDescription>Choose a provider to browse available models</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Select value={selectedProvider?.name || ''} onValueChange={handleProviderChange}>
                  {/* logical id/class via trigger */}
                  <SelectTrigger id="llm-provider-select" className="llm-provider-select">
                    <SelectValue placeholder="Select a provider..." />
                  </SelectTrigger>
                  <SelectContent>
                    {providers.map((provider) => (
                      <SelectItem key={provider.name} value={provider.name} id={`llm-provider-item-${provider.name}`} className="llm-provider-item" data-provider={provider.name}>
                        <div className="flex items-center gap-2">
                          <span>{provider.display_name}</span>
                          {provider.api_key_required && (
                            <Badge variant="outline" className="text-xs">API Key Required</Badge>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {selectedProvider && (
                  <div className="space-y-4 pt-4 border-t">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium">{selectedProvider.display_name}</h3>
                      <ExternalLink className="w-4 h-4" />
                    </div>
                    
                    {selectedProvider.api_key_required && (
                      <div className="space-y-2">
                        <Label htmlFor="apiKey">API Key (required)</Label>
                        <div className="flex gap-2">
                          <Input
                            id="apiKey"
                            type="password"
                            placeholder="Enter your API key..."
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            className="flex-1"
                          />
                          <Button
                            id="provider-load-models-button"
                            onClick={() => loadProviderModels(selectedProvider)}
                            disabled={loading || !apiKey.trim()}
                            size="sm"
                            className="provider-load-models-button"
                          >
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Load"}
                          </Button>
                        </div>
                      </div>
                    )}

                    {!selectedProvider.api_key_required && (
                      <Button
                        id="provider-load-models-button"
                        onClick={() => loadProviderModels(selectedProvider)}
                        disabled={loading}
                        className="w-full provider-load-models-button"
                      >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : "Load Models"}
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Models Browser Column */}
            <Card id="provider-models-browser" className="lg:min-h-[600px] provider-models-browser">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Available Models</span>
                  {providerModels.length > 0 && (
                    <Badge variant="secondary">{filteredProviderModels.length} models</Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  {selectedProvider ? `Browse models from ${selectedProvider.display_name}` : 'Select a provider to view models'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!selectedProvider && (
                  <div className="flex items-center justify-center h-64 text-muted-foreground">
                    <div className="text-center">
                      <Search className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>Select a provider to browse models</p>
                    </div>
                  </div>
                )}

                {selectedProvider && providerModels.length === 0 && !loading && (
                  <div className="flex items-center justify-center h-64 text-muted-foreground">
                    <div className="text-center">
                      <div className="w-12 h-12 mx-auto mb-4 opacity-50 flex items-center justify-center">
                        <span className="text-2xl">📥</span>
                      </div>
                      <p>Click "Load Models" to fetch available models</p>
                    </div>
                  </div>
                )}

                {loading && (
                  <div className="flex items-center justify-center h-64">
                    <div className="text-center">
                      <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
                      <p className="text-muted-foreground">Loading models...</p>
                    </div>
                  </div>
                )}

                {providerModels.length > 0 && (
                  <div className="space-y-4">
                    {/* Sticky Search Bar */}
                    <div className="sticky top-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b pb-4 mb-4">
                      <div className="flex items-center space-x-2">
                        <Search className="w-4 h-4 text-muted-foreground" />
                        <Input
                          id="provider-models-search"
                          placeholder="Search models..."
                          value={modelSearchTerm}
                          onChange={(e) => setModelSearchTerm(e.target.value)}
                          className="flex-1 provider-models-search"
                        />
                      </div>
                    </div>

                    {/* Models Grid */}
                    <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
                      {filteredProviderModels.map((model) => (
                        <Card key={model.id} id={`provider-model-card-${model.id}`} data-model-id={model.id} className="p-4 hover:shadow-md transition-shadow provider-model-card">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <h4 className="font-medium truncate">{model.display_name || model.name || model.id}</h4>
                              {model.description && (
                                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{model.description}</p>
                              )}
                              <div className="flex flex-wrap gap-1 mt-2">
                                {model.context_length && (
                                  <Badge variant="outline" className="text-xs">
                                    {model.context_length.toLocaleString()}k
                                  </Badge>
                                )}
                                {model.max_output_tokens && (
                                  <Badge variant="outline" className="text-xs">
                                    Out: {model.max_output_tokens.toLocaleString()}
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <Button
                              id={`add-model-button-${model.id}`}
                              size="sm"
                              onClick={() => addModelToDatabase(model)}
                              className="shrink-0 add-model-button"
                            >
                              <Plus className="w-4 h-4 mr-1" />
                              Add
                            </Button>
                          </div>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="manage" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Saved Models</CardTitle>
              <CardDescription>Manage your saved LLM models</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {models.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    No models saved yet. Browse providers to add models.
                  </p>
                ) : (
                  <div id="saved-models-grid" className="grid gap-4 saved-models-grid">
                    {models.map((model) => {
                      const provider = providers.find(p => p.id === model.provider_id);
                      return (
                        <Card key={model.id} id={`saved-model-card-${model.id}`} data-model-id={model.id} className="p-4 saved-model-card">
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <h4 className="font-medium">{model.display_name}</h4>
                                <Badge variant="outline">{provider?.display_name}</Badge>
                                <Badge variant={model.is_active ? "default" : "secondary"}>
                                  {model.is_active ? "Active" : "Inactive"}
                                </Badge>
                                {model.supports_streaming && (
                                  <Badge variant="outline">Streaming</Badge>
                                )}
                                {model.supports_reasoning && (
                                  <Badge variant="outline">Reasoning</Badge>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground mt-1">
                                Model ID: {model.model_id}
                              </p>
                              {model.description && (
                                <p className="text-sm text-muted-foreground mt-1">{model.description}</p>
                              )}
                              <div className="flex gap-2 mt-2">
                                {model.context_length && (
                                  <Badge variant="outline">Context: {model.context_length.toLocaleString()}</Badge>
                                )}
                                {model.max_output_tokens && (
                                  <Badge variant="outline">Output: {model.max_output_tokens.toLocaleString()}</Badge>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 ml-4">
                              <Switch
                                id={`saved-model-toggle-${model.id}`}
                                className="saved-model-toggle"
                                checked={model.is_active}
                                onCheckedChange={() => toggleModelActive(model)}
                              />
                              <Button
                                id={`saved-model-delete-${model.id}`}
                                size="sm"
                                variant="outline"
                                className="saved-model-delete"
                                onClick={() => deleteModel(model)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default LLMManagement;
