import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { 
  BarChart3, 
  Clock, 
  Zap, 
 
  TrendingUp, 
  Calendar,
  RefreshCw,
  ArrowLeft,
  Activity,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import { apiService } from '@/services/api';
import type { RunStats, RunHistory } from '@/services/api';

interface DashboardProps {
  onBack: () => void;
}

export function Dashboard({ onBack }: DashboardProps) {
  const { toast } = useToast();
  const [stats, setStats] = useState<RunStats[]>([]);
  const [history, setHistory] = useState<RunHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Set default date range (last 30 days)
  useEffect(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    
    setEndDate(end.toISOString().split('T')[0]);
    setStartDate(start.toISOString().split('T')[0]);
  }, []);

  const loadData = async (filterStartDate?: string, filterEndDate?: string) => {
    setLoading(true);
    try {
      const [statsResponse, historyResponse] = await Promise.all([
        apiService.getRunStats(filterStartDate, filterEndDate),
        apiService.getRunHistory(50, 0, filterStartDate, filterEndDate)
      ]);

      if (statsResponse.success && statsResponse.data) {
        setStats(statsResponse.data);
      }
      
      if (historyResponse.success && historyResponse.data) {
        setHistory(historyResponse.data);
      }
    } catch (error) {
      console.error('Error loading dashboard data:', error);
      toast({
        variant: "destructive",
        title: "Failed to Load Data",
        description: "Could not fetch dashboard statistics. Please try again."
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (startDate && endDate) {
      loadData(startDate, endDate);
    }
  }, [startDate, endDate]);

  const handleRefresh = () => {
    loadData(startDate, endDate);
  };

  const handleDateFilter = () => {
    if (startDate && endDate) {
      loadData(startDate, endDate);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getModelDisplayName = (model: string) => {
    const [provider, modelName] = model.split('/');
    return { provider, modelName };
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 border-b bg-muted/30 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Button variant="ghost" size="sm" onClick={onBack}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Arena
            </Button>
            <div className="h-6 w-px bg-border" />
            <div className="flex items-center space-x-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              <h1 className="text-lg font-semibold">Performance Dashboard</h1>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Date Filters */}
        <div className="flex items-center space-x-4 mt-4">
          <div className="flex items-center space-x-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Date Range:</span>
          </div>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-40"
          />
          <span className="text-muted-foreground">to</span>
          <Input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-40"
          />
          <Button variant="outline" size="sm" onClick={handleDateFilter}>
            Apply Filter
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="flex items-center space-x-2">
              <RefreshCw className="h-5 w-5 animate-spin" />
              <span>Loading dashboard data...</span>
            </div>
          </div>
        ) : stats.length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <Alert className="max-w-md">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                No data available for the selected date range. Run some tests to see statistics here.
              </AlertDescription>
            </Alert>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Overview Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total Runs</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {stats.reduce((sum, stat) => sum + stat.totalRuns, 0)}
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Avg Success Rate</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">
                    {stats.length > 0 
                      ? `${(stats.reduce((sum, stat) => sum + stat.successRate, 0) / stats.length).toFixed(1)}%`
                      : '0%'
                    }
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Avg Speed</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-blue-600">
                    {stats.length > 0 
                      ? `${(stats.reduce((sum, stat) => sum + stat.avgTokensPerSecond, 0) / stats.length).toFixed(1)} tok/s`
                      : '0 tok/s'
                    }
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Avg Latency</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-orange-600">
                    {stats.length > 0 
                      ? `${(stats.reduce((sum, stat) => sum + stat.avgLatency, 0) / stats.length).toFixed(0)}ms`
                      : '0ms'
                    }
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Model Performance Table */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <TrendingUp className="h-5 w-5" />
                  <span>Model Performance Comparison</span>
                </CardTitle>
                <CardDescription>
                  Detailed statistics for each model in the selected date range
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2">Model</th>
                        <th className="text-right p-2">Runs</th>
                        <th className="text-right p-2">Success Rate</th>
                        <th className="text-right p-2">Avg Speed</th>
                        <th className="text-right p-2">Avg Latency</th>
                        <th className="text-right p-2">Avg Tokens</th>
                        <th className="text-right p-2">Reasoning Tokens</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats
                        .sort((a, b) => b.avgTokensPerSecond - a.avgTokensPerSecond)
                        .map((stat) => {
                          const { provider, modelName } = getModelDisplayName(stat.model);
                          return (
                            <tr key={stat.model} className="border-b hover:bg-muted/50">
                              <td className="p-2">
                                <div className="flex items-center space-x-2">
                                  <div>
                                    <div className="font-medium">{modelName}</div>
                                    <div className="text-xs text-muted-foreground">{provider}</div>
                                  </div>
                                </div>
                              </td>
                              <td className="text-right p-2">{stat.totalRuns}</td>
                              <td className="text-right p-2">
                                <Badge variant={stat.successRate >= 90 ? "default" : stat.successRate >= 70 ? "secondary" : "destructive"}>
                                  {stat.successRate.toFixed(1)}%
                                </Badge>
                              </td>
                              <td className="text-right p-2">
                                <div className="flex items-center justify-end space-x-1">
                                  <Zap className="h-3 w-3 text-blue-500" />
                                  <span>{stat.avgTokensPerSecond.toFixed(1)}</span>
                                </div>
                              </td>
                              <td className="text-right p-2">
                                <div className="flex items-center justify-end space-x-1">
                                  <Clock className="h-3 w-3 text-orange-500" />
                                  <span>{stat.avgLatency.toFixed(0)}ms</span>
                                </div>
                              </td>
                              <td className="text-right p-2">{stat.avgTokens.toFixed(0)}</td>
                              <td className="text-right p-2">
                                {stat.avgReasoningTokens > 0 ? stat.avgReasoningTokens.toFixed(0) : '-'}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Recent History */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Activity className="h-5 w-5" />
                  <span>Recent Test History</span>
                </CardTitle>
                <CardDescription>
                  Latest test runs in the selected date range
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {history.slice(0, 10).map((run) => (
                    <div key={run.id} className="border rounded-lg p-3">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <div className="text-sm font-medium mb-1">
                            {run.prompt.length > 100 ? `${run.prompt.substring(0, 100)}...` : run.prompt}
                          </div>
                          <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                            <span>{formatDate(run.created_at)}</span>
                            <span>•</span>
                            <span>{run.models.length} models</span>
                          </div>
                        </div>
                        <div className="flex items-center space-x-1">
                          {run.results.every(r => !r.error) ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          ) : (
                            <AlertTriangle className="h-4 w-4 text-red-500" />
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {run.models.map((model) => {
                          const { modelName } = getModelDisplayName(model);
                          const result = run.results.find(r => r.model === model);
                          return (
                            <Badge 
                              key={model} 
                              variant={result?.error ? "destructive" : "secondary"}
                              className="text-xs"
                            >
                              {modelName}
                            </Badge>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
