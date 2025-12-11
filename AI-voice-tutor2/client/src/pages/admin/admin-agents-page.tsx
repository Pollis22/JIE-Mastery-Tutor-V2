import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Activity, CheckCircle, XCircle, TrendingUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface AgentStats {
  id: string;
  name: string;
  gradeLevel: string;
  agentId: string;
  totalSessions: number;
  recentSessions: number;
  isConfigured: boolean;
}

export default function AdminAgentsPage() {
  const { data, isLoading } = useQuery<{ agents: AgentStats[] }>({
    queryKey: ["/api/admin/agents/stats"],
  });

  const totalSessions = data?.agents.reduce((sum, agent) => sum + agent.totalSessions, 0) || 0;
  const totalRecent = data?.agents.reduce((sum, agent) => sum + agent.recentSessions, 0) || 0;
  const configuredAgents = data?.agents.filter(a => a.isConfigured).length || 0;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2" data-testid="heading-agents">
          Voice AI System Monitoring
        </h1>
        <p className="text-muted-foreground">
          Monitor voice tutoring sessions - Using custom voice stack with Deepgram, Claude, and ElevenLabs
        </p>
        <div className="mt-2 flex gap-2">
          <Badge variant="default" className="bg-blue-600">Custom Voice Stack (Primary)</Badge>
          <Badge variant="outline">Deepgram + Claude + ElevenLabs</Badge>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Configured Agents</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div className="text-2xl font-bold" data-testid="stat-configured">
                  {configuredAgents}/5
                </div>
                <p className="text-xs text-muted-foreground">
                  {configuredAgents === 5 ? "All agents ready" : `${5 - configuredAgents} agent(s) need configuration`}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Sessions</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div className="text-2xl font-bold" data-testid="stat-total">
                  {totalSessions.toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground">
                  All-time voice sessions
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Recent Activity</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div className="text-2xl font-bold" data-testid="stat-recent">
                  {totalRecent.toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground">
                  Sessions in last 7 days
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Agent Details Table */}
      <Card>
        <CardHeader>
          <CardTitle data-testid="heading-table">Agent Configuration & Usage</CardTitle>
          <CardDescription>
            Status and statistics for each age-specific tutoring agent
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : data && data.agents.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead data-testid="header-status">Status</TableHead>
                  <TableHead data-testid="header-agent">Agent</TableHead>
                  <TableHead data-testid="header-grade">Grade Level</TableHead>
                  <TableHead data-testid="header-id">Agent ID</TableHead>
                  <TableHead data-testid="header-total">Total Sessions</TableHead>
                  <TableHead data-testid="header-week">Last 7 Days</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.agents.map((agent, index) => (
                  <TableRow key={agent.id} data-testid={`row-agent-${index}`}>
                    <TableCell data-testid={`status-${index}`}>
                      {agent.isConfigured ? (
                        <Badge variant="default" className="bg-green-500">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="destructive">
                          <XCircle className="h-3 w-3 mr-1" />
                          Not Configured
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="font-medium" data-testid={`name-${index}`}>
                      {agent.name}
                    </TableCell>
                    <TableCell data-testid={`grade-${index}`}>
                      <Badge variant="outline">{agent.gradeLevel}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs" data-testid={`id-${index}`}>
                      {agent.agentId.substring(0, 20)}...
                    </TableCell>
                    <TableCell data-testid={`total-${index}`}>
                      {agent.totalSessions.toLocaleString()}
                    </TableCell>
                    <TableCell data-testid={`recent-${index}`}>
                      <div className="flex items-center gap-2">
                        {agent.recentSessions}
                        {agent.recentSessions > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            Active
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-center text-muted-foreground py-8" data-testid="text-no-agents">
              No agent data available
            </p>
          )}
        </CardContent>
      </Card>

      {/* Configuration Info */}
      <Card>
        <CardHeader>
          <CardTitle data-testid="heading-info">Voice Technology Configuration</CardTitle>
          <CardDescription>
            OpenAI Realtime API powers the voice tutoring experience
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm space-y-2">
            <p className="font-medium">Primary Voice Technology:</p>
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5">
                  <CheckCircle className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="font-medium text-blue-900 dark:text-blue-100">OpenAI Realtime API (WebRTC)</p>
                  <p className="text-sm text-blue-800 dark:text-blue-200 mt-1">
                    Native browser-to-OpenAI audio streaming with GPT-4o and GPT-4o-mini models
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-sm text-blue-700 dark:text-blue-300 mt-2 ml-2">
                    <li>Multi-language support (English, Spanish, Hindi, Chinese)</li>
                    <li>Age-specific voice personalities (5 tutor profiles)</li>
                    <li>RAG integration for document-aware tutoring</li>
                    <li>Live transcript with real-time updates</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <div className="text-sm space-y-2">
            <p className="font-medium">Required Environment Variables:</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-2">
              <li><code className="text-xs bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">OPENAI_API_KEY</code> - OpenAI API authentication</li>
              <li><code className="text-xs bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">USE_REALTIME=true</code> - Enable Realtime API (default)</li>
            </ul>
          </div>

          <div className="text-sm space-y-2">
            <p className="font-medium">Age-Specific Tutor Personalities:</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
              <div className="border rounded p-2">
                <p className="font-medium text-xs">🐻 Buddy Bear (K-2)</p>
                <p className="text-xs text-muted-foreground">Playful, simple language</p>
              </div>
              <div className="border rounded p-2">
                <p className="font-medium text-xs">🔍 Max Explorer (3-5)</p>
                <p className="text-xs text-muted-foreground">Adventurous, curious</p>
              </div>
              <div className="border rounded p-2">
                <p className="font-medium text-xs">🌟 Dr. Nova (6-8)</p>
                <p className="text-xs text-muted-foreground">Knowledgeable, cool</p>
              </div>
              <div className="border rounded p-2">
                <p className="font-medium text-xs">🎓 Professor Ace (9-12)</p>
                <p className="text-xs text-muted-foreground">Expert, college-prep</p>
              </div>
              <div className="border rounded p-2 md:col-span-2">
                <p className="font-medium text-xs">👨‍🔬 Dr. Morgan (College/Adult)</p>
                <p className="text-xs text-muted-foreground">Collaborative peer, practical application</p>
              </div>
            </div>
          </div>

          <div className="text-sm text-muted-foreground mt-4">
            <p>
              The system automatically selects the appropriate tutor personality based on the student's grade level,
              ensuring age-appropriate complexity, vocabulary, and teaching approaches.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
