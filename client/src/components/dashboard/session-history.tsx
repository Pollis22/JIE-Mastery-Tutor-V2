import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { 
  Clock, 
  Calendar,
  Mic,
  FileText,
  ChevronRight,
  Download,
  Search
} from "lucide-react";
import { Input } from "@/components/ui/input";

interface SessionHistoryProps {
  limit?: number;
}

export default function SessionHistory({ limit }: SessionHistoryProps) {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSession, setSelectedSession] = useState<string | null>(null);

  // Fetch session history
  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ['/api/user/sessions', limit],
    enabled: !!user
  });

  const filteredSessions = sessions.filter((session: any) => {
    if (!searchTerm) return true;
    const searchLower = searchTerm.toLowerCase();
    return (
      session.transcript?.toLowerCase().includes(searchLower) ||
      session.subject?.toLowerCase().includes(searchLower) ||
      session.topic?.toLowerCase().includes(searchLower)
    );
  });

  const displaySessions = limit ? filteredSessions.slice(0, limit) : filteredSessions;

  const handleExportSession = async (sessionId: string) => {
    try {
      const response = await fetch(`/api/sessions/${sessionId}/export`);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `session-${sessionId}-${Date.now()}.txt`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Failed to export session:", error);
    }
  };

  if (isLoading) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">Loading session history...</p>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="text-center py-8">
        <Mic className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-muted-foreground">No learning sessions yet</p>
        <p className="text-sm text-muted-foreground mt-2">
          Start a tutoring session to see your history here
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!limit && (
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search sessions..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-sm"
          />
        </div>
      )}

      <ScrollArea className={limit ? "h-[300px]" : "h-[600px]"}>
        <div className="space-y-3">
          {displaySessions.map((session: any) => (
            <Card
              key={session.id}
              className={`cursor-pointer transition-colors ${
                selectedSession === session.id ? "border-primary" : ""
              }`}
              onClick={() => setSelectedSession(selectedSession === session.id ? null : session.id)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">
                        {session.sessionType === 'voice' ? (
                          <><Mic className="mr-1 h-3 w-3" /> Voice</>
                        ) : (
                          <><FileText className="mr-1 h-3 w-3" /> Text</>
                        )}
                      </Badge>
                      {session.subject && (
                        <Badge variant="secondary">{session.subject}</Badge>
                      )}
                      {session.isCompleted && (
                        <Badge variant="default">Completed</Badge>
                      )}
                    </div>
                    
                    <div className="text-sm text-muted-foreground space-y-1">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(session.startedAt), 'MMM dd, yyyy')}
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="h-3 w-3" />
                        {session.voiceMinutesUsed || 0} minutes • 
                        {formatDistanceToNow(new Date(session.startedAt), { addSuffix: true })}
                      </div>
                    </div>

                    {selectedSession === session.id && session.transcript && (
                      <div className="mt-4 p-3 bg-muted/50 rounded-lg">
                        <h4 className="font-medium text-sm mb-2">Session Transcript Preview</h4>
                        <p className="text-sm text-muted-foreground line-clamp-3">
                          {typeof session.transcript === 'string' 
                            ? session.transcript 
                            : JSON.stringify(session.transcript).slice(0, 200)
                          }...
                        </p>
                        <Button
                          variant="link"
                          size="sm"
                          className="mt-2 p-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleExportSession(session.id);
                          }}
                        >
                          <Download className="mr-2 h-3 w-3" />
                          Export Full Transcript
                        </Button>
                      </div>
                    )}
                  </div>

                  <ChevronRight 
                    className={`h-4 w-4 text-muted-foreground transition-transform ${
                      selectedSession === session.id ? "rotate-90" : ""
                    }`} 
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </ScrollArea>

      {!limit && sessions.length > 10 && (
        <p className="text-sm text-muted-foreground text-center">
          Showing {displaySessions.length} of {sessions.length} sessions
        </p>
      )}
    </div>
  );
}