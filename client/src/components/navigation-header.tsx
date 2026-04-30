import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/UserAvatar";
import { Menu, X } from "lucide-react";

export function NavigationHeader() {
  const { user, logoutMutation } = useAuth();
  const [location, setLocation] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const { data: dashboard, isLoading: isDashboardLoading } = useQuery<{
    user?: { name?: string; firstName?: string; initials?: string; plan?: string };
    usage?: { voiceMinutes?: string; percentage?: number };
  }>({
    queryKey: ["/api/dashboard"],
    enabled: !!user,
  });
  
  const displayName = dashboard?.user?.name || 
    `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || 
    user?.username || 
    'User';

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  const isActive = (path: string) => {
    const basePath = path.split("#")[0];
    return location === basePath;
  };

  const navigateTo = (path: string) => {
    if (path.includes("#")) {
      const [basePath, hash] = path.split("#");
      if (location === basePath) {
        document.getElementById(hash)?.scrollIntoView({ behavior: "smooth" });
      } else {
        setLocation(basePath);
        setTimeout(() => {
          document.getElementById(hash)?.scrollIntoView({ behavior: "smooth" });
        }, 500);
      }
    } else {
      setLocation(path);
    }
  };

  return (
    <nav className="bg-card shadow-sm border-b border-border sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16 gap-2">
          <div className="flex items-center min-w-0">
            <Button
              variant="ghost"
              onClick={() => setLocation("/tutor")}
              className="flex-shrink-0 flex items-center hover:bg-accent p-0 h-auto cursor-pointer"
              data-testid="logo-home"
            >
              <img src="/jie-logo-nav.png" alt="JIE Mastery" className="w-8 h-8 object-contain" />
              <span className="ml-2 text-xl font-bold text-foreground whitespace-nowrap">JIE Mastery</span>
            </Button>
            <div className="hidden md:block ml-4 lg:ml-8">
              <div className="flex items-baseline space-x-0.5 lg:space-x-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setLocation("/dashboard")}
                  className={`px-2 lg:px-3 text-sm whitespace-nowrap ${isActive("/dashboard") ? "text-primary font-medium" : "text-muted-foreground"}`}
                  data-testid="nav-dashboard"
                >
                  Dashboard
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setLocation("/family")}
                  className={`px-2 lg:px-3 text-sm whitespace-nowrap ${isActive("/family") ? "text-primary font-medium" : "text-muted-foreground"}`}
                  data-testid="nav-family"
                >
                  Study Tracker
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setLocation("/about-lsis")}
                  className={`px-2 lg:px-3 text-sm whitespace-nowrap ${isActive("/about-lsis") ? "text-primary font-medium" : "text-muted-foreground"}`}
                  data-testid="nav-about-lsis"
                >
                  What is LSIS?
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigateTo("/benefits#test-prep")}
                  className={`px-2 lg:px-3 text-sm whitespace-nowrap ${isActive("/benefits") ? "text-primary font-medium" : "text-muted-foreground"}`}
                  data-testid="nav-test-prep"
                >
                  College Test Prep
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setLocation("/settings")}
                  className={`px-2 lg:px-3 text-sm whitespace-nowrap ${isActive("/settings") ? "text-primary font-medium" : "text-muted-foreground"}`}
                  data-testid="nav-settings"
                >
                  Settings
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setLocation("/support")}
                  className={`hidden 2xl:inline-flex px-2 lg:px-3 text-sm whitespace-nowrap ${isActive("/support") ? "text-primary font-medium" : "text-muted-foreground"}`}
                  data-testid="nav-support"
                >
                  Live Support
                </Button>
                {user?.isAdmin && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setLocation("/admin")}
                    className={`hidden 2xl:inline-flex px-2 lg:px-3 text-sm whitespace-nowrap ${isActive("/admin") ? "text-primary font-medium" : "text-muted-foreground"}`}
                    data-testid="nav-admin"
                  >
                    Admin
                  </Button>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2 lg:gap-3 flex-shrink-0">
            {/* Usage & plan badge - only show on xl+ screens (1280px+) where there's room */}
            <div className="hidden xl:flex items-center space-x-3 text-sm">
              <div className="flex items-center space-x-1">
                <svg className="w-4 h-4 text-secondary flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
                </svg>
                <span className="text-muted-foreground whitespace-nowrap" data-testid="text-usage-minutes">
                  {dashboard?.usage?.voiceMinutes || '0 / 60 min'}
                </span>
              </div>
              <div className="text-muted-foreground">|</div>
              <Badge variant="secondary" className="whitespace-nowrap" data-testid="badge-plan">
                {dashboard?.user?.plan || 'Single Subject Plan'}
              </Badge>
            </div>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2 text-sm hover:bg-accent px-2" data-testid="button-user-menu">
                  <UserAvatar
                    firstName={user?.firstName}
                    lastName={user?.lastName}
                    username={user?.username}
                    displayName={displayName}
                    size="sm"
                    className="border border-primary/20 flex-shrink-0"
                  />
                  <span className="text-foreground font-medium hidden md:inline whitespace-nowrap max-w-[120px] truncate">
                    {displayName}
                  </span>
                  <svg className="w-4 h-4 text-muted-foreground flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd"/>
                  </svg>
                </Button>
              </DropdownMenuTrigger>
              
              <DropdownMenuContent align="end" className="w-56">
                {/* Show usage info inside the dropdown when not visible in nav */}
                <div className="xl:hidden px-2 py-2 border-b border-border mb-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground" data-testid="text-usage-minutes-dropdown">
                      {dashboard?.usage?.voiceMinutes || '0 / 60 min'}
                    </span>
                    <Badge variant="secondary" className="text-xs" data-testid="badge-plan-dropdown">
                      {dashboard?.user?.plan || 'Single Subject Plan'}
                    </Badge>
                  </div>
                </div>

                <DropdownMenuItem onClick={() => setLocation("/profile")} data-testid="menu-profile">
                  <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd"/>
                  </svg>
                  Profile
                </DropdownMenuItem>
                
                <DropdownMenuItem onClick={() => setLocation("/settings")} data-testid="menu-settings">
                  <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd"/>
                  </svg>
                  Settings
                </DropdownMenuItem>

                <DropdownMenuItem onClick={() => setLocation("/support")} data-testid="menu-support">
                  <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd"/>
                  </svg>
                  Live Support
                </DropdownMenuItem>

                {/* Admin link in dropdown — visible to admins on viewports where the inline button is hidden (below xl) */}
                {user?.isAdmin && (
                  <DropdownMenuItem
                    onClick={() => setLocation("/admin")}
                    className="2xl:hidden"
                    data-testid="menu-admin"
                  >
                    <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd"/>
                    </svg>
                    Admin
                  </DropdownMenuItem>
                )}

                <DropdownMenuItem onClick={() => setLocation("/subscribe")} data-testid="menu-billing">
                  <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4zM18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z"/>
                  </svg>
                  Billing
                </DropdownMenuItem>
                
                <DropdownMenuSeparator />
                
                <DropdownMenuItem 
                  onClick={handleLogout}
                  className="text-destructive focus:text-destructive"
                  data-testid="menu-logout"
                >
                  <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clipRule="evenodd"/>
                  </svg>
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Mobile hamburger */}
            <button
              className="md:hidden p-2 rounded-md border border-border flex-shrink-0"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile dropdown menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-border bg-card">
          <div className="px-4 py-3 space-y-1">
            {[
              { label: "Dashboard", path: "/dashboard" },
              { label: "Study Tracker", path: "/family" },
              { label: "About Study Tracker", path: "/about-study-tracker" },
              { label: "What is LSIS?", path: "/about-lsis" },
              { label: "College Test Prep", path: "/benefits#test-prep" },
              { label: "Settings", path: "/settings" },
              { label: "Live Support", path: "/support" },
              { label: "Billing", path: "/subscribe" },
              ...(user?.isAdmin ? [{ label: "Admin", path: "/admin" }] : []),
            ].map(item => (
              <button
                key={item.path}
                onClick={() => { navigateTo(item.path); setMobileMenuOpen(false); }}
                className="block w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-colors"
                style={{
                  color: isActive(item.path) ? "hsl(var(--primary))" : "hsl(var(--foreground))",
                  background: isActive(item.path) ? "hsl(var(--accent))" : "transparent",
                }}
              >
                {item.label}
              </button>
            ))}
            <div className="border-t border-border mt-2 pt-2">
              <button
                onClick={() => { handleLogout(); setMobileMenuOpen(false); }}
                className="block w-full text-left px-4 py-3 rounded-lg text-sm font-medium text-destructive"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
