import { Tv, Image, ListMusic, Clock, LayoutDashboard, LayoutGrid, Users, Building2, Settings, Palette, Key, Sparkles, Mail, AtSign, ClipboardList, BookOpen, BarChart3, DatabaseBackup, Activity } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useAppSettings } from "@/hooks/useAppSettings";
import { useEstablishmentContext } from "@/contexts/EstablishmentContext";
import { useEstablishmentSettings } from "@/hooks/useEstablishmentSettings";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { EstablishmentSwitcher } from "@/components/EstablishmentSwitcher";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { MonitorPlay } from "lucide-react";

const mainItems = [
  { title: "Tableau de bord", url: "/", icon: LayoutDashboard },
  { title: "Écrans", url: "/displays", icon: Tv },
  { title: "Bibliothèque", url: "/library", icon: Image },
  { title: "Layouts", url: "/layouts", icon: LayoutGrid },
  { title: "Playlists", url: "/playlists", icon: ListMusic },
  { title: "Programmation", url: "/schedules", icon: Clock },
  { title: "Config. Écrans", url: "/setup", icon: Settings },
  { title: "Assistant IA", url: "/ai-assistant", icon: Sparkles },
  { title: "Flux Automatique", url: "/auto-flow", icon: Mail },
  { title: "Équipe", url: "/team", icon: Users },
];

const establishmentAdminItems = [
  { title: "Utilisateurs", url: "/admin/users", icon: Users, adminOnly: true, hideForMarketing: false },
  { title: "Personnalisation", url: "/admin/customization", icon: Palette, adminOnly: true, hideForMarketing: true },
  { title: "Email", url: "/admin/email", icon: AtSign, adminOnly: true, hideForMarketing: true },
  { title: "Config. Établissement", url: "/admin/establishment-settings", icon: Settings, adminOnly: false, hideForMarketing: true },
  { title: "Ressources", url: "/admin/resources", icon: BookOpen, adminOnly: false, hideForMarketing: false },
];

const globalAdminItems = [
  { title: "Établissements", url: "/admin/establishments", icon: Building2 },
  { title: "Licences", url: "/admin/licenses", icon: Key },
  { title: "Statistiques", url: "/admin/stats", icon: BarChart3 },
  { title: "Backup & Docker", url: "/admin/backup", icon: DatabaseBackup },
  { title: "État Serveur", url: "/admin/server-status", icon: Activity },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { settings } = useAppSettings();
  const { isGlobalAdmin, isEstablishmentAdmin, isMarketing, currentEstablishmentId, memberships } = useEstablishmentContext();
  const { getSetting } = useEstablishmentSettings(currentEstablishmentId);

  const showAdminSection = isGlobalAdmin || isEstablishmentAdmin || !!currentEstablishmentId;

  // Pending requests count for badge
  const { data: pendingRequestsCount = 0 } = useQuery({
    queryKey: ["pending_requests_count"],
    enabled: isGlobalAdmin,
    refetchInterval: 30000,
    queryFn: async () => {
      const [{ count: resets }, { count: regs }] = await Promise.all([
        supabase.from("password_reset_requests" as any).select("*", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("registration_requests" as any).select("*", { count: "exact", head: true }).eq("status", "pending"),
      ]);
      return (resets || 0) + (regs || 0);
    },
  });

  const estLogoUrl = !isGlobalAdmin && currentEstablishmentId ? getSetting("brand_logo_url") : null;
  const estName = !isGlobalAdmin && currentEstablishmentId ? getSetting("brand_name") : null;
  const currentEst = memberships.find(m => m.establishment_id === currentEstablishmentId);
  const displayLogo = estLogoUrl || (!isGlobalAdmin && currentEst?.establishment ? (currentEst.establishment as any).logo_url : null) || settings.logo_url;
  const displayName = estName || settings.app_name;

  const renderNavItem = (item: typeof mainItems[0], isAdmin = false) => {
    const isActive = location.pathname === item.url;
    return (
      <SidebarMenuItem key={item.title}>
        <SidebarMenuButton asChild isActive={isActive}>
          <NavLink
            to={item.url}
            end
            className={`group relative rounded-xl transition-all duration-200 ${
              isActive
                ? ""
                : "hover:bg-secondary/60"
            }`}
            activeClassName="bg-primary/10 text-primary font-medium"
          >
            <item.icon className={`mr-2.5 h-4 w-4 transition-colors duration-200 ${
              isActive
                ? "text-primary"
                : "text-muted-foreground group-hover:text-foreground"
            }`} />
            {!collapsed && (
              <span className={`text-[13px] tracking-normal ${
                isActive ? "text-primary" : "text-sidebar-foreground group-hover:text-foreground"
              }`}>
                {item.title}
              </span>
            )}
            {isActive && (
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full gradient-primary" />
            )}
          </NavLink>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  return (
    <Sidebar collapsible="icon" className="glass-sidebar">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          {displayLogo ? (
            <img src={displayLogo} alt={displayName} className="h-9 w-9 rounded-xl object-contain shrink-0" />
          ) : (
            <div className="h-9 w-9 rounded-xl gradient-primary flex items-center justify-center shrink-0 shadow-glow-blue">
              <MonitorPlay className="h-5 w-5 text-white" />
            </div>
          )}
          {!collapsed && (
            <div>
              <h1 className="text-base font-bold tracking-tight gradient-primary-text normal-case">{displayName}</h1>
              <p className="text-[10px] text-muted-foreground tracking-wide">{settings.app_tagline}</p>
            </div>
          )}
        </div>
      </SidebarHeader>

      {!collapsed && <EstablishmentSwitcher />}

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-muted-foreground/50 uppercase tracking-widest text-[10px] font-medium">Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-0.5">
              {mainItems.map((item) => renderNavItem(item))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {showAdminSection && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-muted-foreground/50 uppercase tracking-widest text-[10px] font-medium">Administration</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="space-y-0.5">
                {establishmentAdminItems
                  .filter(item => !item.adminOnly || isEstablishmentAdmin || isGlobalAdmin)
                  .filter(item => !item.hideForMarketing || !isMarketing || isGlobalAdmin)
                  .map((item) => renderNavItem(item, true))}
                {isGlobalAdmin && globalAdminItems.map((item) => {
                  if (item.url === "/admin/requests" && pendingRequestsCount > 0) {
                    return (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton asChild isActive={location.pathname === item.url}>
                          <NavLink to={item.url} end className={`group relative rounded-xl transition-all duration-200 ${location.pathname === item.url ? "" : "hover:bg-secondary/60"}`} activeClassName="bg-primary/10 text-primary font-medium">
                            <item.icon className={`mr-2.5 h-4 w-4 transition-colors duration-200 ${location.pathname === item.url ? "text-primary" : "text-muted-foreground group-hover:text-foreground"}`} />
                            {!collapsed && <span className={`text-[13px] tracking-normal ${location.pathname === item.url ? "text-primary" : "text-sidebar-foreground group-hover:text-foreground"}`}>{item.title}</span>}
                            {!collapsed && <Badge className="ml-auto h-5 min-w-5 px-1 flex items-center justify-center text-[10px]">{pendingRequestsCount}</Badge>}
                            {collapsed && <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-destructive" />}
                          </NavLink>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  }
                  return renderNavItem(item, true);
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="p-3">
        {!collapsed && (
          <div className="px-2 py-1.5 text-[11px] text-muted-foreground rounded-lg bg-secondary/30">
            Mode local public
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
