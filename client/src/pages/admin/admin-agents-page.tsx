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
          ElevenLabs Agent Monitoring
        </h1>
        <p className="text-muted-foreground">
          Monitor the status and usage of all age-specific ConvAI agents
        </p>
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
          <CardTitle data-testid="heading-info">Configuration Information</CardTitle>
          <CardDescription>
            ElevenLabs ConvAI agents are configured via environment variables
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="text-sm space-y-1">
            <p className="font-medium">Required Environment Variables:</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-2">
              <li><code className="text-xs bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">ELEVENLABS_AGENT_K2</code> - Kindergarten to 2nd grade</li>
              <li><code className="text-xs bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">ELEVENLABS_AGENT_35</code> - 3rd to 5th grade</li>
              <li><code className="text-xs bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">ELEVENLABS_AGENT_68</code> - 6th to 8th grade</li>
              <li><code className="text-xs bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">ELEVENLABS_AGENT_912</code> - 9th to 12th grade</li>
              <li><code className="text-xs bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">ELEVENLABS_AGENT_COLLEGE</code> - College/Adult</li>
            </ul>
          </div>
          <div className="text-sm text-muted-foreground mt-4">
            <p>
              Each agent is optimized for its target age group with appropriate complexity,
              vocabulary, and teaching approaches. Sessions are automatically routed to the
              correct agent based on the user's grade level.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
