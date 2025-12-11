import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

const sessionSummarySchema = z.object({
  summary: z.string().optional(),
  misconceptions: z.string().optional(),
  nextSteps: z.string().optional(),
});

type SessionSummaryData = z.infer<typeof sessionSummarySchema>;

interface SessionSummaryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId?: string;
  studentName?: string;
  onSaved?: () => void;
}

export function SessionSummaryModal({
  open,
  onOpenChange,
  sessionId,
  studentName,
  onSaved,
}: SessionSummaryModalProps) {
  const { toast } = useToast();

  const form = useForm<SessionSummaryData>({
    resolver: zodResolver(sessionSummarySchema),
    defaultValues: {
      summary: "",
      misconceptions: "",
      nextSteps: "",
    },
  });

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      form.reset({
        summary: "",
        misconceptions: "",
        nextSteps: "",
      });
    }
  }, [open, form]);

  const updateSessionMutation = useMutation({
    mutationFn: async (data: SessionSummaryData) => {
      if (!sessionId) throw new Error("No session ID");
      
      const res = await apiRequest('PUT', `/api/sessions/${sessionId}`, {
        ...data,
        endedAt: new Date().toISOString(),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/students'] });
      toast({ 
        title: "Session saved", 
        description: "Your learning progress has been recorded" 
      });
      onSaved?.();
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error saving session",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: SessionSummaryData) => {
    updateSessionMutation.mutate(data);
  };

  const handleSkip = () => {
    if (sessionId) {
      // Just end the session without summary
      updateSessionMutation.mutate({
        summary: "",
        endedAt: new Date().toISOString(),
      } as any);
    } else {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[525px]" data-testid="dialog-session-summary">
        <DialogHeader>
          <DialogTitle>
            Session Complete{studentName ? ` - ${studentName}` : ''}
          </DialogTitle>
          <DialogDescription>
            Save notes about this learning session to help personalize future tutoring
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="summary"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Session Summary</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="What did we work on today? What went well?"
                      className="min-h-[80px]"
                      {...field}
                      data-testid="textarea-session-summary"
                    />
                  </FormControl>
                  <FormDescription>
                    Brief overview of what was covered
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="misconceptions"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Misconceptions Addressed</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Any concepts that needed clarification?"
                      className="min-h-[60px]"
                      {...field}
                      data-testid="textarea-misconceptions"
                    />
                  </FormControl>
                  <FormDescription>
                    Areas that may need reinforcement
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="nextSteps"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Next Steps</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="What should we focus on next time?"
                      className="min-h-[60px]"
                      {...field}
                      data-testid="textarea-next-steps"
                    />
                  </FormControl>
                  <FormDescription>
                    Recommended topics for next session
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleSkip}
                disabled={updateSessionMutation.isPending}
                data-testid="button-skip-summary"
              >
                Skip
              </Button>
              <Button
                type="submit"
                disabled={updateSessionMutation.isPending}
                data-testid="button-save-summary"
              >
                Save Session
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
