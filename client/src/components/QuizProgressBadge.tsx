/**
 * QuizProgressBadge — compact "Question N of 10 · 45s" indicator shown
 * during an active quiz. Includes an Exit Quiz link that triggers a
 * confirmation dialog before abandoning.
 *
 * Phase 4 frontend for the Voice Quiz feature.
 */

import { useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Brain, Timer, X, CheckCircle2, XCircle } from "lucide-react";

export type QuizClientPhase =
  | "idle"
  | "starting"
  | "asking"
  | "listening"
  | "grading"
  | "feedback"
  | "summary"
  | "done";

interface QuizProgressBadgeProps {
  phase: QuizClientPhase;
  questionNumber: number;       // 1-indexed (e.g., 3 of 10)
  totalQuestions: number;
  questionsAnswered: number;    // increments on each graded answer
  questionsCorrect: number;
  /** Last answer correctness (drives the brief feedback flash) */
  lastAnswerCorrect: boolean | null;
  /** Whether the per-question timer is enabled (HS / College only) */
  timerEnabled: boolean;
  /** Timer duration in seconds (when enabled) */
  perQuestionSeconds: number | null;
  /** Phase-change timestamp; resets timer when LISTENING begins */
  listeningStartedAt: number | null;
  /** Called after user confirms in the abandon dialog */
  onAbandon: () => void;
}

export function QuizProgressBadge({
  phase,
  questionNumber,
  totalQuestions,
  questionsAnswered,
  questionsCorrect,
  lastAnswerCorrect,
  timerEnabled,
  perQuestionSeconds,
  listeningStartedAt,
  onAbandon,
}: QuizProgressBadgeProps) {
  const [showAbandonDialog, setShowAbandonDialog] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  // Tick the countdown when listening with timer enabled
  useEffect(() => {
    if (!timerEnabled || !perQuestionSeconds || !listeningStartedAt || phase !== "listening") {
      setSecondsLeft(null);
      return;
    }

    const update = () => {
      const elapsedSec = Math.floor((Date.now() - listeningStartedAt) / 1000);
      const remaining = Math.max(0, perQuestionSeconds - elapsedSec);
      setSecondsLeft(remaining);
    };

    update();
    const interval = setInterval(update, 250);
    return () => clearInterval(interval);
  }, [timerEnabled, perQuestionSeconds, listeningStartedAt, phase]);

  // Don't render until we have a real question
  if (phase === "idle" || phase === "done") return null;

  const phaseLabel = (() => {
    switch (phase) {
      case "starting": return "Generating quiz…";
      case "asking": return "Tutor speaking";
      case "listening": return "Your turn";
      case "grading": return "Grading…";
      case "feedback":
        if (lastAnswerCorrect === true) return "Correct";
        if (lastAnswerCorrect === false) return "Incorrect";
        return "Feedback";
      case "summary": return "Wrapping up…";
      default: return "Quiz";
    }
  })();

  const phaseIcon = (() => {
    if (phase === "feedback" && lastAnswerCorrect === true) {
      return <CheckCircle2 className="h-4 w-4 text-green-600" />;
    }
    if (phase === "feedback" && lastAnswerCorrect === false) {
      return <XCircle className="h-4 w-4 text-amber-600" />;
    }
    return <Brain className="h-4 w-4 text-primary" />;
  })();

  const showTimer = timerEnabled && phase === "listening" && secondsLeft !== null;
  const timerLow = showTimer && secondsLeft !== null && secondsLeft <= 10;

  return (
    <>
      <div
        className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/30 text-xs font-medium"
        data-testid="badge-quiz-progress"
      >
        {phaseIcon}
        <span className="text-primary">
          Q{questionNumber} of {totalQuestions}
        </span>
        <span className="text-muted-foreground">·</span>
        <span className="text-foreground/80">{phaseLabel}</span>

        {showTimer && (
          <>
            <span className="text-muted-foreground">·</span>
            <span
              className={`flex items-center gap-1 tabular-nums ${
                timerLow ? "text-red-600 font-semibold animate-pulse" : "text-foreground/70"
              }`}
              data-testid="text-quiz-timer"
            >
              <Timer className="h-3 w-3" />
              {secondsLeft}s
            </span>
          </>
        )}

        {questionsAnswered > 0 && (
          <>
            <span className="text-muted-foreground">·</span>
            <span className="text-foreground/70" data-testid="text-quiz-running-score">
              {questionsCorrect}/{questionsAnswered} correct
            </span>
          </>
        )}

        <button
          type="button"
          onClick={() => setShowAbandonDialog(true)}
          className="ml-1 flex items-center gap-0.5 text-muted-foreground hover:text-red-600 transition-colors"
          title="Exit quiz"
          aria-label="Exit quiz"
          data-testid="button-quiz-exit"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <AlertDialog open={showAbandonDialog} onOpenChange={setShowAbandonDialog}>
        <AlertDialogContent data-testid="dialog-quiz-abandon">
          <AlertDialogHeader>
            <AlertDialogTitle>Exit this quiz?</AlertDialogTitle>
            <AlertDialogDescription>
              Your progress through question {questionNumber} of {totalQuestions} will be saved,
              but the quiz will end now. You can start a new quiz any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-abandon-cancel">
              Keep going
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onAbandon();
                setShowAbandonDialog(false);
              }}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
              data-testid="button-abandon-confirm"
            >
              Yes, exit quiz
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
