import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu, X, Sparkles, Play, DollarSign, HelpCircle, GraduationCap, Mail, Headphones, LogIn, Tag } from "lucide-react";

interface PublicMobileMenuProps {
  onSignIn: () => void;
}

export function PublicMobileMenu({ onSignIn }: PublicMobileMenuProps) {
  const [open, setOpen] = useState(false);
  const [, setLocation] = useLocation();

  const navigate = (path: string) => {
    setOpen(false);
    setLocation(path);
  };

  const handleSignIn = () => {
    setOpen(false);
    onSignIn();
  };

  const menuItems = [
    { label: "Why JIE Mastery", path: "/benefits", icon: Sparkles },
    { label: "Demo", path: "/demo", icon: Play },
    { label: "Pricing", path: "/pricing", icon: DollarSign },
    { label: "FAQ", path: "/faq", icon: HelpCircle },
    { label: "Schools", path: "/schools", icon: GraduationCap },
    { label: "Offers", path: "/offer", icon: Tag },
    { label: "Contact", path: "/contact", icon: Mail },
    { label: "Live Support", path: "/support", icon: Headphones },
  ];

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          data-testid="button-mobile-menu"
          aria-label="Open menu"
        >
          <Menu className="h-6 w-6" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-72 p-0">
        <div className="flex flex-col h-full">
          <div className="p-4 border-b border-border">
            <p className="font-semibold text-foreground">Menu</p>
          </div>
          <nav className="flex-1 py-2">
            {menuItems.map((item) => (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className="flex items-center gap-3 w-full px-4 py-3 text-left text-foreground hover:bg-accent transition-colors"
                data-testid={`mobile-nav-${item.path.slice(1)}`}
              >
                <item.icon className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm font-medium">{item.label}</span>
              </button>
            ))}
          </nav>
          <div className="p-4 border-t border-border space-y-2">
            <Button
              variant="outline"
              className="w-full justify-start gap-3"
              onClick={handleSignIn}
              data-testid="mobile-nav-sign-in"
            >
              <LogIn className="h-5 w-5" />
              Sign In
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
