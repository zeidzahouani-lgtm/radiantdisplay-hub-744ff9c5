import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Outlet } from "react-router-dom";
import { NotificationBell } from "@/components/NotificationBell";
import { useEstablishmentBranding } from "@/hooks/useEstablishmentBranding";
import { useTheme } from "@/contexts/ThemeContext";
import { Moon, Sun, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { LocalMaintenanceBanner } from "@/components/LocalMaintenanceBanner";

export function DashboardLayout() {
  useEstablishmentBranding();
  const { theme, toggleTheme } = useTheme();

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full relative overflow-hidden">
        <AnimatedBackground />
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <LocalMaintenanceBanner />
          <header className="h-12 flex items-center justify-between glass-header px-4 shrink-0">
            <SidebarTrigger className="mr-4 text-muted-foreground hover:text-primary transition-colors" />
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleTheme}
                className="h-8 w-8 text-muted-foreground hover:text-primary"
              >
                {theme === "dark" ? <Sun className="h-4 w-4" /> : theme === "light" ? <Zap className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
              <NotificationBell />
            </div>
          </header>
          <main className="flex-1 overflow-auto p-3 sm:p-4 md:p-6">
            <div className="max-w-7xl mx-auto animate-cyber-in">
              <Outlet />
            </div>
          </main>
          <footer className="h-8 flex items-center justify-center shrink-0 border-t border-border/30">
            <span className="text-[11px] text-muted-foreground/50 tracking-wider">
              ScreenFlow by Dravox
            </span>
          </footer>
        </div>
      </div>
    </SidebarProvider>
  );
}
