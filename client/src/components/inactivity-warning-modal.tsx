import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Clock } from "lucide-react";

interface InactivityWarningModalProps {
  open: boolean;
  secondsLeft: number;
  onStayLoggedIn: () => void;
  onLogout: () => void;
}

export function InactivityWarningModal({
  open,
  secondsLeft,
  onStayLoggedIn,
  onLogout,
}: InactivityWarningModalProps) {
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const timeDisplay = minutes > 0 
    ? `${minutes}:${seconds.toString().padStart(2, "0")}` 
    : `${seconds}s`;

  return (
    <AlertDialog open={open}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-lg">
            <Clock className="h-5 w-5 text-amber-500" />
            Are you still there?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-base">
            You've been inactive for a while. For your security, you'll be
            logged out in <span className="font-semibold text-foreground">{timeDisplay}</span>.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex gap-2 sm:gap-0">
          <Button variant="outline" onClick={onLogout}>
            Log out
          </Button>
          <Button onClick={onStayLoggedIn} autoFocus>
            I'm still here
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
