import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { format } from "date-fns";
import {
  ArrowLeft,
  Calendar,
  Clock,
  User,
  Bot,
  Download,
  Trash2,
  MessageCircle,
  Globe,
  GraduationCap
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export default function SessionDetailsPage() {
  const { id } = useParams();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  // Fetch session details
  const { data, isLoading, error } = useQuery({
    queryKey: [`/api/sessions/${id}`],
    enabled: !!id,
  });

  const session = data?.session;

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this session? This action cannot be undone.")) {
      return;
    }

    try {
      const response = await apiRequest("DELETE", `/api/sessions/${id}`);
      if (response.ok) {
        toast({
          title: "Session deleted",
          description: "The session has been permanently deleted.",
        });
        navigate("/dashboard?tab=sessions");
      } else {
        throw new Error("Failed to delete session");
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete session. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleExport = () => {
    if (!session?.transcript) return;
    
    const transcriptText = session.transcript.map((msg: any) => 
      `[${format(new Date(msg.timestamp), 'HH:mm:ss')}] ${msg.speaker === 'tutor' ? 'Tutor' : 'Student'}: ${msg.text}`
    ).join('\n\n');
    
    const blob = new Blob([transcriptText], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `session-${session.id}-transcript.txt`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardContent className="py-12">
            <p className="text-center text-muted-foreground">Loading session...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardContent className="py-12">
            <p className="text-center text-muted-foreground">Session not found</p>
            <Button
              variant="link"
              className="mt-4"
              onClick={() => navigate("/dashboard?tab=sessions")}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Sessions
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <Button
          variant="ghost"
          onClick={() => navigate("/dashboard?tab=sessions")}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Sessions
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExport} data-testid="button-export">
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          <Button variant="destructive" onClick={handleDelete} data-testid="button-delete">
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      {/* Session Info */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Session Details</CardTitle>
          <CardDescription>
            {session.summary || "Tutoring session transcript"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-1">
              <div className="flex items-center text-sm text-muted-foreground">
                <User className="mr-2 h-4 w-4" />
                Student
              </div>
              <p className="font-medium">{session.studentName || "Unknown"}</p>
            </div>
            
            <div className="space-y-1">
              <div className="flex items-center text-sm text-muted-foreground">
                <Calendar className="mr-2 h-4 w-4" />
                Date
              </div>
              <p className="font-medium">
                {format(new Date(session.startedAt), 'MMM dd, yyyy h:mm a')}
              </p>
            </div>
            
            <div className="space-y-1">
              <div className="flex items-center text-sm text-muted-foreground">
                <Clock className="mr-2 h-4 w-4" />
                Duration
              </div>
              <p className="font-medium">{session.minutesUsed || 0} minutes</p>
            </div>
            
            <div className="space-y-1">
              <div className="flex items-center text-sm text-muted-foreground">
                <MessageCircle className="mr-2 h-4 w-4" />
                Messages
              </div>
              <p className="font-medium">{session.totalMessages || 0} messages</p>
            </div>
          </div>
          
          <div className="mt-4 flex flex-wrap gap-2">
            {session.subject && (
              <Badge variant="secondary">
                <GraduationCap className="mr-1 h-3 w-3" />
                {session.subject}
              </Badge>
            )}
            {session.language && (
              <Badge variant="outline">
                <Globe className="mr-1 h-3 w-3" />
                {session.language === 'en' ? 'English' : 
                 session.language === 'es' ? 'Spanish' : 
                 session.language === 'hi' ? 'Hindi' : 
                 session.language === 'zh' ? 'Chinese' : session.language}
              </Badge>
            )}
            {session.ageGroup && (
              <Badge variant="outline">{session.ageGroup}</Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Transcript */}
      <Card>
        <CardHeader>
          <CardTitle>Conversation Transcript</CardTitle>
          <CardDescription>
            Full conversation between student and tutor
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[600px] w-full pr-4">
            {session.transcript && session.transcript.length > 0 ? (
              <div className="space-y-4">
                {session.transcript.map((message: any, index: number) => (
                  <div
                    key={message.messageId || index}
                    className={`flex gap-3 ${
                      message.speaker === 'tutor' ? 'justify-start' : 'justify-end'
                    }`}
                  >
                    <div
                      className={`flex gap-3 max-w-[80%] ${
                        message.speaker === 'tutor' ? 'flex-row' : 'flex-row-reverse'
                      }`}
                    >
                      <div
                        className={`h-8 w-8 rounded-full flex items-center justify-center ${
                          message.speaker === 'tutor'
                            ? 'bg-primary/10 text-primary'
                            : 'bg-secondary text-secondary-foreground'
                        }`}
                      >
                        {message.speaker === 'tutor' ? (
                          <Bot className="h-4 w-4" />
                        ) : (
                          <User className="h-4 w-4" />
                        )}
                      </div>
                      <div className="space-y-1">
                        <div
                          className={`rounded-lg px-4 py-2 ${
                            message.speaker === 'tutor'
                              ? 'bg-muted'
                              : 'bg-primary text-primary-foreground'
                          }`}
                        >
                          <p className="text-sm">{message.text}</p>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(message.timestamp), 'h:mm:ss a')}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">
                No transcript available for this session
              </p>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}