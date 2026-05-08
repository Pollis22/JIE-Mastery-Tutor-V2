/**
 * QuizScoreModal — final score summary shown when the server emits
 * `quiz_complete`. Displays score percentage, raw count, per-topic
 * breakdown, and a celebratory or encouraging tone based on score.
 *
 * Phase 4 frontend for the Voice Quiz feature.
 */

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Trophy, Target, TrendingUp, BookOpen } from "lucide-react";

export interface QuizSummaryPayload {
  quizId: string;
  topic: string;
  totalQuestions: number;
  questionsAnswered: number;
  questionsCorrect: number;
  scorePct: number;
  startedAt: string | Date;
  completedAt: string | Date | null;
  perTopicBreakdown: Array<{
    topicTag: string;
    correct: number;
    total: number;
    accuracyPct: number;
  }>;
}

interface QuizScoreModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  summary: QuizSummaryPayload | null;
  onStartAnother?: () => void;
}

export function QuizScoreModal({ open, onOpenChange, summary, onStartAnother }: QuizScoreModalProps) {
  if (!summary) return null;

  const { topic, totalQuestions, questionsCorrect, scorePct, perTopicBreakdown } = summary;

  // Tone-of-voice based on score
  const tone = (() => {
    if (scorePct >= 90) return { label: "Outstanding!", color: "text-green-600", bg: "bg-green-50", border: "border-green-200" };
    if (scorePct >= 75) return { label: "Great work!", color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200" };
    if (scorePct >= 60) return { label: "Good effort", color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-200" };
    if (scorePct >= 40) return { label: "Keep practicing", color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200" };
    return { label: "Let's review this", color: "text-orange-600", bg: "bg-orange-50", border: "border-orange-200" };
  })();

  const weakAreas = perTopicBreakdown
    .filter((t) => t.total >= 2 && t.accuracyPct < 60)
    .sort((a, b) => a.accuracyPct - b.accuracyPct);

  const strongAreas = perTopicBreakdown
    .filter((t) => t.total >= 2 && t.accuracyPct >= 75)
    .sort((a, b) => b.accuracyPct - a.accuracyPct);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]" data-testid="modal-quiz-score">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-primary" />
            Quiz Complete
          </DialogTitle>
          <DialogDescription>
            Here's how you did on <span className="font-medium text-foreground">{topic}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Score hero */}
          <div className={`rounded-lg ${tone.bg} ${tone.border} border p-4 text-center`}>
            <div className={`text-sm font-medium uppercase tracking-wide ${tone.color}`}>
              {tone.label}
            </div>
            <div className="mt-1 flex items-baseline justify-center gap-2">
              <span className="text-5xl font-bold text-foreground tabular-nums">{scorePct}%</span>
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              {questionsCorrect} of {totalQuestions} correct
            </div>
          </div>

          {/* Per-topic breakdown */}
          {perTopicBreakdown.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                <Target className="h-4 w-4 text-primary" />
                By subtopic
              </div>
              <div className="space-y-1.5" data-testid="list-topic-breakdown">
                {perTopicBreakdown.map((t) => (
                  <div
                    key={t.topicTag}
                    className="flex items-center justify-between text-sm py-1.5 px-2 rounded bg-muted/30"
                  >
                    <span className="text-foreground/80 truncate" title={t.topicTag}>
                      {t.topicTag}
                    </span>
                    <span className="text-muted-foreground tabular-nums whitespace-nowrap ml-2">
                      {t.correct}/{t.total} · {t.accuracyPct}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Strong / weak callouts */}
          {strongAreas.length > 0 && (
            <div className="rounded-md border border-green-200 bg-green-50/50 p-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-green-700 uppercase tracking-wide">
                <TrendingUp className="h-3.5 w-3.5" />
                Strong
              </div>
              <div className="mt-1 text-sm text-foreground/80">
                {strongAreas.slice(0, 2).map((t) => t.topicTag).join(", ")}
              </div>
            </div>
          )}

          {weakAreas.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50/50 p-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 uppercase tracking-wide">
                <BookOpen className="h-3.5 w-3.5" />
                Worth reviewing
              </div>
              <div className="mt-1 text-sm text-foreground/80">
                {weakAreas.slice(0, 2).map((t) => t.topicTag).join(", ")}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid="button-score-close"
          >
            Back to tutoring
          </Button>
          {onStartAnother && (
            <Button
              onClick={() => {
                onOpenChange(false);
                onStartAnother();
              }}
              data-testid="button-score-another"
            >
              Take another quiz
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
