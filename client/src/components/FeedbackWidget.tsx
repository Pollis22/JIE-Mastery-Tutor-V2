import { useState } from "react";
import { MessageSquarePlus, Send, ChevronDown, ChevronUp, Star, CheckCircle2, X } from "lucide-react";

type FeedbackCategory = "general" | "suggestion" | "bug" | "praise";

const CATEGORIES: { value: FeedbackCategory; label: string; emoji: string }[] = [
  { value: "praise", label: "What I love", emoji: "⭐" },
  { value: "suggestion", label: "Suggestion", emoji: "💡" },
  { value: "bug", label: "Something's off", emoji: "🔧" },
  { value: "general", label: "General feedback", emoji: "💬" },
];

export function FeedbackWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [category, setCategory] = useState<FeedbackCategory>("general");
  const [rating, setRating] = useState<number>(0);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!message.trim()) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, rating, message: message.trim() }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to send feedback");
      }

      setSubmitted(true);
      // Auto-collapse after 3s
      setTimeout(() => {
        setIsOpen(false);
        setSubmitted(false);
        setMessage("");
        setRating(0);
        setCategory("general");
      }, 3000);
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const charCount = message.length;
  const maxChars = 500;

  return (
    <div className="mt-4 rounded-xl border border-border bg-card overflow-hidden shadow-sm">
      {/* Header toggle */}
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors group"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <MessageSquarePlus className="w-4 h-4 text-primary" />
          </div>
          <span className="text-sm font-semibold text-foreground">Share Your Feedback</span>
          <span className="hidden sm:inline text-xs text-muted-foreground font-normal">— Help us improve JIE Mastery</span>
        </div>
        <div className="flex items-center gap-2">
          {!isOpen && (
            <span className="text-xs text-muted-foreground hidden sm:inline bg-muted px-2 py-0.5 rounded-full">
              Takes 30 seconds
            </span>
          )}
          {isOpen ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
          )}
        </div>
      </button>

      {/* Expandable body */}
      {isOpen && (
        <div className="px-4 pb-4 border-t border-border/60 pt-4 space-y-4">
          {submitted ? (
            /* Success state */
            <div className="flex flex-col items-center justify-center py-6 gap-3 text-center">
              <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="font-semibold text-foreground text-sm">Thank you for your feedback!</p>
                <p className="text-xs text-muted-foreground mt-1">Your input helps us make JIE Mastery better for everyone.</p>
              </div>
            </div>
          ) : (
            <>
              {/* Category picker */}
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Category</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat.value}
                      onClick={() => setCategory(cat.value)}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                        category === cat.value
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground"
                      }`}
                    >
                      <span>{cat.emoji}</span>
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Star rating */}
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                  Overall Experience <span className="normal-case font-normal">(optional)</span>
                </p>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      onClick={() => setRating(star === rating ? 0 : star)}
                      onMouseEnter={() => setHoverRating(star)}
                      onMouseLeave={() => setHoverRating(0)}
                      className="focus:outline-none"
                      aria-label={`Rate ${star} stars`}
                    >
                      <Star
                        className={`w-6 h-6 transition-colors ${
                          star <= (hoverRating || rating)
                            ? "fill-amber-400 text-amber-400"
                            : "text-muted-foreground/30 hover:text-amber-300"
                        }`}
                      />
                    </button>
                  ))}
                  {rating > 0 && (
                    <span className="text-xs text-muted-foreground self-center ml-1">
                      {["", "Poor", "Fair", "Good", "Great", "Excellent"][rating]}
                    </span>
                  )}
                </div>
              </div>

              {/* Message textarea */}
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Your Message</p>
                <div className="relative">
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value.slice(0, maxChars))}
                    placeholder={
                      category === "praise"
                        ? "Tell us what's working well…"
                        : category === "suggestion"
                        ? "What feature or improvement would help most?"
                        : category === "bug"
                        ? "Describe what happened and when…"
                        : "Share your thoughts, questions, or ideas…"
                    }
                    rows={3}
                    className="w-full px-3 py-2.5 text-sm bg-background border border-input rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent placeholder:text-muted-foreground/60 transition-shadow"
                  />
                  <span
                    className={`absolute bottom-2 right-2 text-xs ${
                      charCount > maxChars * 0.9 ? "text-amber-500" : "text-muted-foreground/40"
                    }`}
                  >
                    {charCount}/{maxChars}
                  </span>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-lg">
                  <X className="w-3.5 h-3.5 flex-shrink-0" />
                  {error}
                </div>
              )}

              {/* Submit */}
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Sent privately to our team at{" "}
                  <span className="font-medium text-foreground/70">JIE Mastery</span>
                </p>
                <button
                  onClick={handleSubmit}
                  disabled={!message.trim() || submitting}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                >
                  {submitting ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                      Sending…
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      Send Feedback
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
