/**
 * GuideLibrary — Browse and add JIE-provided study guides
 * 
 * Appears as a tab in the AssignmentsPanel or as a standalone panel.
 * Students browse by category, preview guides, and click "Add to My Documents"
 * to make them available for session selection via the standard checkbox flow.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Check, BookOpen, ChevronDown, ChevronUp, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface StudyGuide {
  id: string;
  title: string;
  description: string | null;
  category: string;
  subcategory: string | null;
  subject: string | null;
  contentTokens: number | null;
  fileType: string;
  iconEmoji: string;
  sortOrder: number;
  version: number;
  alreadyAdded: boolean;
}

interface GuideLibraryProps {
  gradeBand?: string;
  onGuideAdded?: (documentId: string) => void;
}

const CATEGORY_LABELS: Record<string, { label: string; description: string }> = {
  'test_prep': { label: 'Test Prep Guides', description: 'SAT, ACT, GRE, GMAT, LSAT, MCAT & more' },
  'professional_cert': { label: 'Professional Certification', description: 'CPA, CFA, NCLEX, FE/PE & more' },
  'college_coursework': { label: 'College Course Guides', description: 'Subject-specific study materials' },
  'k12': { label: 'K-12 Study Guides', description: 'Grade-level learning materials' },
};

export function GuideLibrary({ gradeBand = 'College/Adult', onGuideAdded }: GuideLibraryProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [previewGuideId, setPreviewGuideId] = useState<string | null>(null);

  // Fetch available guides
  const { data, isLoading, error } = useQuery({
    queryKey: [`/api/guides/library?gradeBand=${encodeURIComponent(gradeBand)}`],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/guides/library?gradeBand=${encodeURIComponent(gradeBand)}`);
      return response.json() as Promise<{
        guides: StudyGuide[];
        grouped: Record<string, StudyGuide[]>;
        categories: string[];
      }>;
    },
  });

  // Fetch guide preview
  const { data: previewData, isLoading: previewLoading } = useQuery({
    queryKey: [`/api/guides/${previewGuideId}`],
    queryFn: async () => {
      if (!previewGuideId) return null;
      const response = await apiRequest('GET', `/api/guides/${previewGuideId}`);
      return response.json();
    },
    enabled: !!previewGuideId,
  });

  // Add guide mutation
  const addGuideMutation = useMutation({
    mutationFn: async (guideId: string) => {
      const response = await apiRequest('POST', '/api/guides/add-to-library', { guideId });
      return response.json();
    },
    onSuccess: (result) => {
      if (result.alreadyExists) {
        toast({ title: "Already Added", description: "This guide is already in your documents." });
      } else {
        toast({ title: "Guide Added!", description: result.message });
        onGuideAdded?.(result.documentId);
      }
      // Refresh both guide list (to update alreadyAdded flags) and document list
      queryClient.invalidateQueries({ queryKey: [`/api/guides/library`] });
      queryClient.invalidateQueries({ queryKey: [`/api/documents/list`] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: "Failed to add guide. Please try again.", variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12" data-testid="guide-library-loading">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Loading study guides...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center py-8 text-muted-foreground" data-testid="guide-library-error">
        <BookOpen className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>Unable to load study guides right now.</p>
      </div>
    );
  }

  if (data.categories.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground" data-testid="guide-library-empty">
        <BookOpen className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="font-medium">No study guides available yet</p>
        <p className="text-sm mt-1">Check back soon — new guides are added regularly.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="guide-library">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <BookOpen className="h-5 w-5 text-primary" />
        <h3 className="font-semibold text-base">JIE Study Guide Library</h3>
      </div>
      <p className="text-sm text-muted-foreground -mt-2">
        Add guides to your documents, then select them before starting a session.
      </p>

      {/* Categories */}
      {data.categories.map(category => {
        const guides = data.grouped[category] || [];
        const catInfo = CATEGORY_LABELS[category] || { label: category, description: '' };
        const isExpanded = expandedCategory === category || data.categories.length === 1;

        return (
          <div key={category} className="border rounded-lg overflow-hidden" data-testid={`guide-category-${category}`}>
            {/* Category Header */}
            <button
              className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
              onClick={() => setExpandedCategory(isExpanded ? null : category)}
              data-testid={`guide-category-toggle-${category}`}
            >
              <div>
                <div className="font-medium text-sm">{catInfo.label}</div>
                <div className="text-xs text-muted-foreground">{catInfo.description}</div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">{guides.length}</Badge>
                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
            </button>

            {/* Guide List */}
            {isExpanded && (
              <div className="p-3 space-y-2">
                {guides.map(guide => (
                  <Card key={guide.id} className="border shadow-none" data-testid={`guide-card-${guide.id}`}>
                    <CardContent className="p-3">
                      <div className="flex items-start gap-3">
                        {/* Icon */}
                        <div className="text-2xl mt-0.5 shrink-0">{guide.iconEmoji}</div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm">{guide.title}</div>
                          {guide.description && (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{guide.description}</p>
                          )}
                          <div className="flex items-center gap-2 mt-1.5">
                            {guide.subcategory && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">{guide.subcategory}</Badge>
                            )}
                            {guide.contentTokens && (
                              <span className="text-[10px] text-muted-foreground">
                                ~{Math.ceil(guide.contentTokens / 250)} min read
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex flex-col gap-1.5 shrink-0">
                          {guide.alreadyAdded ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 text-xs text-green-600 dark:text-green-400 gap-1"
                              disabled
                              data-testid={`guide-added-${guide.id}`}
                            >
                              <Check className="h-3.5 w-3.5" />
                              Added
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="default"
                              className="h-8 text-xs gap-1"
                              onClick={() => addGuideMutation.mutate(guide.id)}
                              disabled={addGuideMutation.isPending}
                              data-testid={`guide-add-${guide.id}`}
                            >
                              {addGuideMutation.isPending ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Plus className="h-3.5 w-3.5" />
                              )}
                              Add
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs gap-1 text-muted-foreground"
                            onClick={() => setPreviewGuideId(previewGuideId === guide.id ? null : guide.id)}
                            data-testid={`guide-preview-${guide.id}`}
                          >
                            <Eye className="h-3 w-3" />
                            Preview
                          </Button>
                        </div>
                      </div>

                      {/* Preview Panel */}
                      {previewGuideId === guide.id && (
                        <div className="mt-3 pt-3 border-t" data-testid={`guide-preview-content-${guide.id}`}>
                          {previewLoading ? (
                            <div className="flex items-center gap-2 py-4">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              <span className="text-sm text-muted-foreground">Loading preview...</span>
                            </div>
                          ) : previewData ? (
                            <div className="text-xs text-muted-foreground whitespace-pre-wrap max-h-48 overflow-y-auto bg-muted/20 rounded p-2 font-mono leading-relaxed">
                              {previewData.preview}
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground py-2">Preview not available.</p>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
