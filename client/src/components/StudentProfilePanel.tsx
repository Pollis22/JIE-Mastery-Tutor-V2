import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2, Download } from "lucide-react";
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

const studentFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  grade: z.string().optional(),
  learningPace: z.enum(["slow", "moderate", "fast"]).optional(),
  encouragementLevel: z.enum(["minimal", "moderate", "high"]).optional(),
  goals: z.array(z.string()).optional(),
});

type StudentFormData = z.infer<typeof studentFormSchema>;

interface Student {
  id: string;
  name: string;
  grade?: string;
  learningPace?: string;
  encouragementLevel?: string;
  goals?: string[];
}

interface UserDocument {
  id: string;
  title: string;
  processingStatus: string;
}

interface StudentPin {
  id: string;
  docId: string;
}

interface StudentProfilePanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId?: string;
  onStudentSaved?: (studentId: string) => void;
  onStudentDeleted?: (studentId: string) => void;
}

export function StudentProfilePanel({
  open,
  onOpenChange,
  studentId,
  onStudentSaved,
  onStudentDeleted,
}: StudentProfilePanelProps) {
  const { toast } = useToast();
  const [goalsText, setGoalsText] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Fetch student data if editing
  const { data: student } = useQuery<Student>({
    queryKey: ['/api/students', studentId],
    enabled: !!studentId,
  });

  // Fetch user documents for pinning
  const { data: documents = [] } = useQuery<UserDocument[]>({
    queryKey: ['/api/documents'],
  });

  // Fetch pinned documents
  const { data: pins = [], isLoading: pinsLoading } = useQuery<StudentPin[]>({
    queryKey: ['/api/students', studentId, 'pins'],
    enabled: !!studentId,
  });

  const form = useForm<StudentFormData>({
    resolver: zodResolver(studentFormSchema),
    defaultValues: {
      name: "",
      grade: "",
      learningPace: undefined,
      encouragementLevel: undefined,
      goals: [],
    },
  });

  // Update form when student data loads
  useEffect(() => {
    if (student) {
      form.reset({
        name: student.name,
        grade: student.grade || "",
        learningPace: student.learningPace as any,
        encouragementLevel: student.encouragementLevel as any,
        goals: student.goals || [],
      });
      setGoalsText((student.goals || []).join("\n"));
    } else {
      form.reset({
        name: "",
        grade: "",
        learningPace: undefined,
        encouragementLevel: undefined,
        goals: [],
      });
      setGoalsText("");
    }
  }, [student, form]);

  const createMutation = useMutation({
    mutationFn: async (data: StudentFormData) => {
      const goals = goalsText
        .split("\n")
        .map(g => g.trim())
        .filter(g => g.length > 0);
      
      const res = await apiRequest('POST', '/api/students', { ...data, goals });
      return res.json();
    },
    onSuccess: (newStudent: Student) => {
      queryClient.invalidateQueries({ queryKey: ['/api/students'] });
      toast({ title: "Student created successfully" });
      onStudentSaved?.(newStudent.id);
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error creating student",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: StudentFormData) => {
      const goals = goalsText
        .split("\n")
        .map(g => g.trim())
        .filter(g => g.length > 0);
      
      const res = await apiRequest('PUT', `/api/students/${studentId}`, { ...data, goals });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/students'] });
      queryClient.invalidateQueries({ queryKey: ['/api/students', studentId] });
      toast({ title: "Student updated successfully" });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error updating student",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest('DELETE', `/api/students/${studentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/students'] });
      toast({ title: "Student deleted successfully" });
      setDeleteDialogOpen(false);
      onOpenChange(false);
      if (studentId) {
        onStudentDeleted?.(studentId);
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error deleting student",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const exportMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/students/${studentId}/export`);
      return res.json();
    },
    onSuccess: (data) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${student?.name || 'student'}-memory-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Memory exported successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Error exporting memory",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const pinMutation = useMutation({
    mutationFn: async ({ docId, isPinned }: { docId: string; isPinned: boolean }) => {
      if (isPinned) {
        const pin = pins.find(p => p.docId === docId);
        if (pin) {
          await apiRequest('DELETE', `/api/students/${studentId}/pins/${pin.id}`);
        }
      } else {
        await apiRequest('POST', `/api/students/${studentId}/pins`, { docId });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/students', studentId, 'pins'] });
      toast({ title: "Pinned documents updated" });
    },
    onError: (error: any) => {
      toast({
        title: "Error updating pins",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: StudentFormData) => {
    if (studentId) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const readyDocuments = documents.filter(
    doc => doc.processingStatus === 'ready' || doc.processingStatus === 'completed'
  );

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="sm:max-w-[540px] overflow-y-auto" data-testid="sheet-student-profile">
          <SheetHeader>
            <SheetTitle>
              {studentId ? "Edit Student Profile" : "Create Student Profile"}
            </SheetTitle>
            <SheetDescription>
              {studentId
                ? "Update student information and learning preferences"
                : "Create a new student profile with learning preferences"}
            </SheetDescription>
          </SheetHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 mt-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Enter student name"
                        {...field}
                        data-testid="input-student-name"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="grade"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Grade Level</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., 5th Grade, College Sophomore"
                        {...field}
                        data-testid="input-student-grade"
                      />
                    </FormControl>
                    <FormDescription>Optional grade or education level</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="learningPace"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Learning Pace</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-learning-pace">
                          <SelectValue placeholder="Select learning pace" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="slow">Slow & Thorough</SelectItem>
                        <SelectItem value="moderate">Moderate</SelectItem>
                        <SelectItem value="fast">Fast & Challenging</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      How quickly the tutor should move through topics
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="encouragementLevel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Encouragement Level</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-encouragement">
                          <SelectValue placeholder="Select encouragement level" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="minimal">Minimal</SelectItem>
                        <SelectItem value="moderate">Moderate</SelectItem>
                        <SelectItem value="high">High & Enthusiastic</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Amount of praise and encouragement during learning
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div>
                <FormLabel>Learning Goals</FormLabel>
                <Textarea
                  placeholder="Enter one goal per line&#10;e.g., Master algebra&#10;Improve reading comprehension"
                  value={goalsText}
                  onChange={(e) => setGoalsText(e.target.value)}
                  className="mt-2 min-h-[100px]"
                  data-testid="textarea-goals"
                />
                <FormDescription>
                  One goal per line - these guide the tutoring sessions
                </FormDescription>
              </div>

              {studentId && readyDocuments.length > 0 && (
                <div>
                  <FormLabel>Pinned Study Materials</FormLabel>
                  <FormDescription className="mb-3">
                    Select materials to automatically use in this student's sessions
                  </FormDescription>
                  {pinsLoading ? (
                    <div className="text-sm text-muted-foreground py-3">Loading pinned materials...</div>
                  ) : (
                    <div className="space-y-2 max-h-[200px] overflow-y-auto border rounded-md p-3">
                      {readyDocuments.map((doc) => {
                        const isPinned = pins.some(p => p.docId === doc.id);
                        return (
                          <div
                            key={doc.id}
                            className="flex items-center space-x-2"
                          >
                            <Checkbox
                              id={`pin-${doc.id}`}
                              checked={isPinned}
                              disabled={pinsLoading || pinMutation.isPending}
                              onCheckedChange={() =>
                                pinMutation.mutate({ docId: doc.id, isPinned })
                              }
                              data-testid={`checkbox-pin-${doc.id}`}
                            />
                            <label
                              htmlFor={`pin-${doc.id}`}
                              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                            >
                              {doc.title}
                            </label>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-2 pt-4">
                <Button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  data-testid="button-save-student"
                >
                  {studentId ? "Update Profile" : "Create Profile"}
                </Button>

                {studentId && (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => exportMutation.mutate()}
                      disabled={exportMutation.isPending}
                      data-testid="button-export-memory"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Export Memory
                    </Button>

                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => setDeleteDialogOpen(true)}
                      disabled={deleteMutation.isPending}
                      data-testid="button-delete-student"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </Button>
                  </>
                )}
              </div>
            </form>
          </Form>
        </SheetContent>
      </Sheet>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Student Profile?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {student?.name}'s profile, including all
              session history and learning progress. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              Delete Profile
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
