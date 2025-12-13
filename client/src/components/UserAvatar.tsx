import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface UserAvatarProps {
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  avatarUrl?: string | null;
  displayName?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

function getInitials(firstName?: string | null, lastName?: string | null, username?: string | null): string {
  if (firstName && lastName) {
    return `${firstName[0]}${lastName[0]}`.toUpperCase();
  }
  if (firstName) {
    return firstName.substring(0, 2).toUpperCase();
  }
  if (username) {
    return username.substring(0, 2).toUpperCase();
  }
  return 'U';
}

function getSizeClasses(size: "sm" | "md" | "lg"): string {
  switch (size) {
    case "sm":
      return "h-8 w-8 text-sm";
    case "lg":
      return "h-24 w-24 text-2xl";
    case "md":
    default:
      return "h-10 w-10 text-base";
  }
}

export function UserAvatar({
  firstName,
  lastName,
  username,
  avatarUrl,
  displayName = "User",
  size = "md",
  className = "",
}: UserAvatarProps) {
  const initials = getInitials(firstName, lastName, username);
  const sizeClasses = getSizeClasses(size);

  return (
    <Avatar className={`${sizeClasses} ${className}`}>
      {avatarUrl && <AvatarImage src={avatarUrl} alt={displayName} />}
      <AvatarFallback className="bg-primary text-primary-foreground font-semibold">
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}
