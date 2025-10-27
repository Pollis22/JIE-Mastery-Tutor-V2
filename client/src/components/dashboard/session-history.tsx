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

  // Fetch session history using correct endpoint
  const { data, isLoading } = useQuery({
    queryKey: limit ? ['/api/sessions/recent'] : ['/api/sessions'],
    enabled: !!user
  });

  const sessions = data?.sessions || [];

  const filteredSessions = sessions.filter((session: any) => {
    if (!searchTerm) return true;
    const searchLower = searchTerm.toLowerCase();
    return (
      session.summary?.toLowerCase().includes(searchLower) ||
      session.subject?.toLowerCase().includes(searchLower) ||
      session.studentName?.toLowerCase().includes(searchLower) ||
      session.ageGroup?.toLowerCase().includes(searchLower)
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
                      {session.language && (
                        <Badge variant="outline">
                          {session.language === 'en' ? '🇺🇸' : 
                           session.language === 'es' ? '🇪🇸' : 
                           session.language === 'hi' ? '🇮🇳' : 
                           session.language === 'zh' ? '🇨🇳' : ''} {session.language.toUpperCase()}
                        </Badge>
                      )}
                      {session.subject && (
                        <Badge variant="secondary">{session.subject}</Badge>
                      )}
                      {session.ageGroup && (
                        <Badge variant="outline">{session.ageGroup}</Badge>
                      )}
                      {session.totalMessages > 0 && (
                        <Badge variant="default">
                          <FileText className="mr-1 h-3 w-3" />
                          {session.totalMessages} messages
                        </Badge>
                      )}
                    </div>
                    
                    <div className="text-sm text-muted-foreground space-y-1">
                      {session.studentName && (
                        <div className="font-medium text-foreground">
                          Student: {session.studentName}
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(session.startedAt), 'MMM dd, yyyy h:mm a')}
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="h-3 w-3" />
                        {session.minutesUsed || 0} minutes • 
                        {formatDistanceToNow(new Date(session.startedAt), { addSuffix: true })}
                      </div>
                    </div>

                    {session.summary && (
                      <div className="mt-2 p-2 bg-muted/30 rounded">
                        <p className="text-sm">{session.summary}</p>
                      </div>
                    )}

                    {selectedSession === session.id && (
                      <div className="mt-4 p-3 bg-muted/50 rounded-lg">
                        <h4 className="font-medium text-sm mb-3 flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          Conversation Transcript ({session.transcript?.length || 0} messages)
                        </h4>
                        
                        {session.transcript && session.transcript.length > 0 ? (
                          <ScrollArea className="h-[300px] w-full pr-4">
                            <div className="space-y-3">
                              {session.transcript.map((entry: any, index: number) => (
                                <div key={entry.messageId || index} className={`flex items-start gap-3 ${
                                  entry.speaker === 'tutor' || entry.speaker === 'assistant' 
                                    ? 'flex-row' 
                                    : 'flex-row-reverse'
                                }`}>
                                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                                    entry.speaker === 'tutor' || entry.speaker === 'assistant'
                                      ? 'bg-primary text-primary-foreground'
                                      : 'bg-secondary text-secondary-foreground'
                                  }`}>
                                    {entry.speaker === 'tutor' || entry.speaker === 'assistant' ? '🎓' : '👤'}
                                  </div>
                                  <div className={`flex-1 rounded-lg p-3 ${
                                    entry.speaker === 'tutor' || entry.speaker === 'assistant'
                                      ? 'bg-primary/10 border border-primary/20'
                                      : 'bg-secondary/50 border border-secondary'
                                  }`}>
                                    <div className="flex items-center justify-between mb-1">
                                      <span className="text-xs font-medium">
                                        {entry.speaker === 'tutor' || entry.speaker === 'assistant' ? 'Tutor' : 'Student'}
                                      </span>
                                      {entry.timestamp && (
                                        <span className="text-xs text-muted-foreground">
                                          {format(new Date(entry.timestamp), 'h:mm:ss a')}
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-sm whitespace-pre-wrap break-words">
                                      {entry.text || entry.content || ''}
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </ScrollArea>
                        ) : (
                          <div className="text-sm text-muted-foreground py-4 text-center">
                            No transcript available for this session
                          </div>
                        )}
                        
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-3"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleExportSession(session.id);
                          }}
                          data-testid={`button-export-${session.id}`}
                        >
                          <Download className="mr-2 h-3 w-3" />
                          Export Transcript
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