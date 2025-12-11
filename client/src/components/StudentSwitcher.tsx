import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { User, ChevronDown, Plus, Settings } from "lucide-react";

interface Student {
  id: string;
  name: string;
  grade?: string;
  avatarUrl?: string;
  avatarType?: 'default' | 'preset' | 'upload';
}

interface StudentSwitcherProps {
  selectedStudentId?: string;
  onSelectStudent: (studentId: string | null) => void;
  onOpenProfile: (studentId?: string) => void;
}

const LAST_STUDENT_KEY = 'jie-last-selected-student';

export function StudentSwitcher({ 
  selectedStudentId, 
  onSelectStudent, 
  onOpenProfile 
}: StudentSwitcherProps) {
  const { user } = useAuth();
  const { data: students = [], isLoading } = useQuery<Student[]>({
    queryKey: ['/api/students'],
  });

  // Auto-select last student or first available student on mount
  useEffect(() => {
    if (isLoading || students.length === 0 || selectedStudentId) {
      return; // Wait for data or skip if already selected
    }

    // Try to restore last selected student
    try {
      const lastSelected = localStorage.getItem(LAST_STUDENT_KEY);
      if (lastSelected && students.some(s => s.id === lastSelected)) {
        onSelectStudent(lastSelected);
        return;
      }
    } catch {
      // Ignore storage errors
    }

    // Otherwise, auto-select the first student
    if (students.length > 0) {
      onSelectStudent(students[0].id);
    }
  }, [students, isLoading, selectedStudentId, onSelectStudent]);

  // Save selected student to localStorage
  const handleSelectStudent = (studentId: string) => {
    try {
      localStorage.setItem(LAST_STUDENT_KEY, studentId);
    } catch {
      // Ignore storage errors
    }
    onSelectStudent(studentId);
  };

  const currentStudent = students.find(s => s.id === selectedStudentId);
  
  // Use current student name, or fall back to user's default student name from profile
  const displayName = currentStudent?.name || user?.studentName || user?.firstName || "Student";

  // Helper to render avatar based on type
  const renderAvatar = (student: Student | undefined, size: 'sm' | 'md' = 'sm') => {
    if (!student?.avatarUrl) {
      return <User className={size === 'sm' ? "h-4 w-4" : "h-5 w-5"} />;
    }
    
    if (student.avatarType === 'upload') {
      // Render as image for uploaded avatars
      return (
        <img 
          src={student.avatarUrl} 
          alt={student.name}
          className={`rounded-full object-cover ${size === 'sm' ? 'w-4 h-4' : 'w-5 h-5'}`}
        />
      );
    }
    
    // Render as emoji for preset avatars
    return <span className={size === 'sm' ? "text-sm" : "text-base"}>{student.avatarUrl}</span>;
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="gap-2 ml-6"
          data-testid="button-student-switcher"
        >
          {renderAvatar(currentStudent, 'sm')}
          <span className="max-w-[150px] truncate">
            {displayName}
          </span>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[220px]">
        <DropdownMenuLabel>Student Profiles</DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        {isLoading && (
          <DropdownMenuItem disabled>Loading...</DropdownMenuItem>
        )}
        
        {!isLoading && students.length === 0 && (
          <DropdownMenuItem disabled>No students yet</DropdownMenuItem>
        )}
        
        {students.map(student => (
          <DropdownMenuItem
            key={student.id}
            onClick={() => handleSelectStudent(student.id)}
            className="gap-2"
            data-testid={`student-option-${student.id}`}
          >
            <div className="w-5 h-5 flex items-center justify-center">
              {renderAvatar(student, 'md')}
            </div>
            <div className="flex flex-col">
              <span>{student.name}</span>
              {student.grade && (
                <span className="text-xs text-muted-foreground">{student.grade}</span>
              )}
            </div>
          </DropdownMenuItem>
        ))}
        
        <DropdownMenuSeparator />
        
        <DropdownMenuItem
          onClick={() => onOpenProfile()}
          className="gap-2"
          data-testid="button-create-student"
        >
          <Plus className="h-4 w-4" />
          <span>Create New Student</span>
        </DropdownMenuItem>
        
        {currentStudent && (
          <DropdownMenuItem
            onClick={() => onOpenProfile(currentStudent.id)}
            className="gap-2"
            data-testid="button-edit-student"
          >
            <Settings className="h-4 w-4" />
            <span>Edit Profile</span>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
