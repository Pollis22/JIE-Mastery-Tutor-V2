/**
 * QuizStartModal — collects topic + grade band + mode, then fires startQuiz().
 *
 * Phase 4 frontend for the Voice Quiz feature.
 * - Defaults gradeBand from the active session's ageGroup
 * - All 5 grade bands available (State is our K-12 dev site)
 * - Practice mode is the default; Exam mode signals stricter scoring (server-side)
 */

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GraduationCap, Sparkles } from "lucide-react";

export type QuizGradeBand =
  | "kindergarten-2"
  | "grades-3-5"
  | "grades-6-8"
  | "grades-9-12"
  | "college-adult";

export type QuizMode = "practice" | "exam";

interface QuizStartModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Maps to the session's `ageGroup` so we default sensibly */
  defaultGradeBand?: QuizGradeBand;
  /** Called when user clicks Start — parent should call useCustomVoice.startQuiz() */
  onStart: (params: { topic: string; gradeBand: QuizGradeBand; mode: QuizMode }) => void;
}

const GRADE_BAND_OPTIONS: Array<{ value: QuizGradeBand; label: string; helper: string }> = [
  { value: "kindergarten-2", label: "Kindergarten – 2nd grade", helper: "Foundational, simple language" },
  { value: "grades-3-5", label: "Grades 3 – 5", helper: "Elementary core skills" },
  { value: "grades-6-8", label: "Grades 6 – 8", helper: "Middle school breadth" },
  { value: "grades-9-12", label: "Grades 9 – 12", helper: "Timed: 60s/question" },
  { value: "college-adult", label: "College / Adult", helper: "Timed: 75s/question" },
];

export function QuizStartModal({
  open,
  onOpenChange,
  defaultGradeBand = "college-adult",
  onStart,
}: QuizStartModalProps) {
  const [topic, setTopic] = useState("");
  const [gradeBand, setGradeBand] = useState<QuizGradeBand>(defaultGradeBand);
  const [mode, setMode] = useState<QuizMode>("practice");

  // Reset state every time the modal opens
  useEffect(() => {
    if (open) {
      setTopic("");
      setGradeBand(defaultGradeBand);
      setMode("practice");
    }
  }, [open, defaultGradeBand]);

  const trimmedTopic = topic.trim();
  const canStart = trimmedTopic.length >= 2;

  const handleStart = () => {
    if (!canStart) return;
    onStart({ topic: trimmedTopic, gradeBand, mode });
    onOpenChange(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && canStart) {
      e.preventDefault();
      handleStart();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]" data-testid="modal-quiz-start">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Start a Voice Quiz
          </DialogTitle>
          <DialogDescription>
            Your tutor will pause the conversation and quiz you with 10 multiple-choice
            questions. Answer aloud or by saying the letter (A, B, C, or D).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Topic */}
          <div className="space-y-1.5">
            <Label htmlFor="quiz-topic" className="text-sm font-medium">
              Quiz topic
            </Label>
            <Input
              id="quiz-topic"
              data-testid="input-quiz-topic"
              autoFocus
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g., photosynthesis, Civil War causes, derivatives"
              maxLength={120}
            />
            <p className="text-xs text-muted-foreground">
              Be specific — narrower topics produce sharper questions.
            </p>
          </div>

          {/* Grade band */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium flex items-center gap-1.5">
              <GraduationCap className="h-4 w-4" />
              Difficulty level
            </Label>
            <div className="grid grid-cols-1 gap-1.5">
              {GRADE_BAND_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setGradeBand(opt.value)}
                  className={`text-left px-3 py-2 rounded-md border transition-colors ${
                    gradeBand === opt.value
                      ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                      : "border-border hover:border-primary/40 hover:bg-muted/30"
                  }`}
                  data-testid={`button-grade-band-${opt.value}`}
                >
                  <div className="text-sm font-medium">{opt.label}</div>
                  <div className="text-xs text-muted-foreground">{opt.helper}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Mode */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Mode</Label>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setMode("practice")}
                className={`flex-1 px-3 py-2 rounded-md border text-sm transition-colors ${
                  mode === "practice"
                    ? "border-primary bg-primary/5 ring-1 ring-primary/30 font-medium"
                    : "border-border hover:border-primary/40"
                }`}
                data-testid="button-mode-practice"
              >
                Practice
              </button>
              <button
                type="button"
                onClick={() => setMode("exam")}
                className={`flex-1 px-3 py-2 rounded-md border text-sm transition-colors ${
                  mode === "exam"
                    ? "border-primary bg-primary/5 ring-1 ring-primary/30 font-medium"
                    : "border-border hover:border-primary/40"
                }`}
                data-testid="button-mode-exam"
              >
                Exam
              </button>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid="button-quiz-cancel"
          >
            Cancel
          </Button>
          <Button
            onClick={handleStart}
            disabled={!canStart}
            data-testid="button-quiz-start"
          >
            <Sparkles className="h-4 w-4 mr-2" />
            Start Quiz
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Maps the session's ageGroup string to a QuizGradeBand. */
export function ageGroupToGradeBand(
  ageGroup?: "K-2" | "3-5" | "6-8" | "9-12" | "College/Adult"
): QuizGradeBand {
  switch (ageGroup) {
    case "K-2": return "kindergarten-2";
    case "3-5": return "grades-3-5";
    case "6-8": return "grades-6-8";
    case "9-12": return "grades-9-12";
    case "College/Adult": return "college-adult";
    default: return "college-adult";
  }
}
