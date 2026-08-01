const fs = require('fs');

const navPath = 'frontend/src/components/layout/Navbar.tsx';
let content = fs.readFileSync(navPath, 'utf8');

// I will just replace the entire content of Navbar.tsx
const newContent = `import { useState, useMemo } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { ThemeToggle } from "../ui/ThemeToggle";
import { Button } from "../ui/button";
import { cn } from "@/lib/utils";
import {
  Menu,
  Activity,
  UserCircle2,
  CalendarDays,
  FileText,
  Bell,
  Settings,
  HeartPulse,
  LayoutDashboard,
  ShieldCheck,
  Search,
  LogOut,
  Stethoscope,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { Badge } from "../ui/badge";
import { CommandPalette } from "../ui/CommandPalette";
import { LanguageSwitcher } from "../ui/LanguageSwitcher";
import { 
  Sidebar, 
  SidebarContent, 
  SidebarGroup, 
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader, 
  SidebarMenu, 
  SidebarMenuItem, 
  SidebarMenuButton,
  SidebarFooter,
  useSidebar,
  SidebarTrigger
} from "@/components/ui/sidebar";

type NavLinkItem = {
  to: string;
  icon: React.ReactNode;
  label: string;
  badge?: number | boolean;
};

// --- Custom NavLink Component using SidebarMenuButton ---
function SidebarNavLink({ item, active }: { item: NavLinkItem, active: boolean }) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
        <Link to={item.to} className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            {item.icon}
            <span>{item.label}</span>
          </div>
          {typeof item.badge === "number" && item.badge > 0 && (
            <Badge variant="secondary" className="bg-teal-500/15 text-teal-600 dark:text-teal-400 font-bold border border-teal-500/30">
              {item.badge}
            </Badge>
          )}
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export function Navbar() {
  const { user, profile, role, pendingConsents, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const pathname = location.pathname;
  const { toggleSidebar, isMobile } = useSidebar();
  const [cmdOpen, setCmdOpen] = useState(false);

  if (pathname === '/login' || pathname === '/signup' || pathname === '/') return null;

  // Derived Values
  const displayName = profile?.first_name 
    ? \`\${profile.first_name} \${profile.last_name || ''}\`.trim() 
    : user?.email?.split('@')[0] || 'User';

  const roleLabel = role === 'doctor' ? 'Healthcare Provider' 
                  : role === 'hospital' ? 'Hospital Admin' 
                  : 'Patient';

  const dashboardHref = role === 'doctor' ? '/doctor' 
                      : role === 'hospital' ? '/hospital' 
                      : '/dashboard';

  const initials = useMemo(() => {
    const s = (displayName || "U").trim();
    return s.slice(0, 2).toUpperCase();
  }, [displayName]);

  // Links definitions
  const patientLinks: NavLinkItem[] = [
    { to: "/dashboard", icon: <LayoutDashboard className="h-4 w-4" />, label: "Dashboard" },
    { to: "/patient/my-medicines", icon: <FileText className="h-4 w-4" />, label: "My Medicines" },
    { to: "/patient/consent", icon: <ShieldCheck className="h-4 w-4" />, label: "Consents", badge: pendingConsents },
    { to: "/patient/routines", icon: <HeartPulse className="h-4 w-4" />, label: "Health Tracker" },
    { to: "/patient/records", icon: <FileText className="h-4 w-4" />, label: "Medical Records" },
    { to: "/patient/appointments", icon: <CalendarDays className="h-4 w-4" />, label: "Appointments" },
    { to: "/patient/providers", icon: <Stethoscope className="h-4 w-4" />, label: "My Providers" },
    { to: "/patient/settings", icon: <Settings className="h-4 w-4" />, label: "Settings" },
  ];

  const doctorLinks: NavLinkItem[] = [
    { to: "/doctor", icon: <LayoutDashboard className="h-4 w-4" />, label: "Dashboard" },
    { to: "/doctor/patients", icon: <UserCircle2 className="h-4 w-4" />, label: "My Patients" },
    { to: "/doctor/appointments", icon: <CalendarDays className="h-4 w-4" />, label: "Schedule" },
    { to: "/doctor/records", icon: <FileText className="h-4 w-4" />, label: "Patient Records" },
    { to: "/doctor/settings", icon: <Settings className="h-4 w-4" />, label: "Settings" },
  ];

  const hospitalLinks: NavLinkItem[] = [
    { to: "/hospital", icon: <LayoutDashboard className="h-4 w-4" />, label: "Overview" },
    { to: "/hospital/staff", icon: <UserCircle2 className="h-4 w-4" />, label: "Staff Directory" },
    { to: "/hospital/patients", icon: <HeartPulse className="h-4 w-4" />, label: "All Patients" },
    { to: "/hospital/settings", icon: <Settings className="h-4 w-4" />, label: "Settings" },
  ];

  const links = role === 'doctor' ? doctorLinks 
              : role === 'hospital' ? hospitalLinks 
              : patientLinks;

  const cmdItems = [
    {
      id: "dashboard",
      title: "Dashboard",
      icon: <LayoutDashboard className="h-4 w-4" />,
      onSelect: () => navigate(dashboardHref),
    },
    ...links.map(l => ({
      id: l.to,
      title: l.label,
      icon: l.icon,
      onSelect: () => navigate(l.to),
    }))
  ];

  return (
    <>
      {/* MOBILE TOP BAR - Uses SidebarTrigger */}
      {isMobile && (
        <header className="sticky top-0 inset-x-0 z-50 glass-panel border-b border-border/40 bg-background/90 backdrop-blur-md">
          <div className="w-full px-4 h-16 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <SidebarTrigger />
              <Link to="/" className="flex items-center gap-2">
                <div className="relative h-7 w-7 rounded-lg bg-gradient-to-br from-blue-600 via-teal-500 to-emerald-500 flex items-center justify-center shadow-lg">
                  <Activity className="w-4 h-4 text-white" />
                </div>
                <div className="font-black font-heading tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-blue-700 via-teal-500 to-emerald-600 dark:from-blue-400 dark:via-teal-300 dark:to-emerald-400">
                  MyHealth<span className="opacity-80 font-bold text-teal-600 dark:text-teal-400">Chain</span>
                </div>
              </Link>
            </div>
            
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCmdOpen(true)}
                className="h-9 w-9 rounded-xl border bg-background hover:bg-muted/40 transition-colors flex items-center justify-center"
              >
                <Search className="h-4 w-4 text-muted-foreground" />
              </button>
              {user && (
                <button
                  className="relative h-9 w-9 rounded-xl border bg-background hover:bg-muted/40 transition-all flex items-center justify-center"
                  onClick={() => navigate(role === "patient" ? "/patient/consent" : dashboardHref)}
                >
                  <Bell className="h-4 w-4 text-muted-foreground" />
                  {pendingConsents > 0 && (
                    <span className="absolute -top-1 -right-1 h-4 min-w-[16px] px-1 rounded-full bg-red-500 text-white text-[9px] font-bold shadow-sm flex items-center justify-center animate-pulse">
                      {pendingConsents}
                    </span>
                  )}
                </button>
              )}
            </div>
          </div>
        </header>
      )}

      {/* SHADCN SIDEBAR */}
      <Sidebar variant="sidebar" collapsible="icon">
        <SidebarHeader className="h-16 flex items-center border-b justify-center px-4">
          <Link to="/" className="flex items-center gap-3 w-full overflow-hidden">
            <div className="relative shrink-0">
              <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-blue-600 via-teal-500 to-emerald-500 flex items-center justify-center shadow-lg shadow-primary/25">
                <Activity className="w-5 h-5 text-white" />
              </div>
            </div>
            <div className="leading-tight truncate group-data-[collapsible=icon]:hidden">
              <div className="font-black font-heading text-lg tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-blue-700 via-teal-500 to-emerald-600 dark:from-blue-400 dark:via-teal-300 dark:to-emerald-400">
                MyHealth<span className="opacity-80 font-bold text-teal-600 dark:text-teal-400">Chain</span>
              </div>
            </div>
          </Link>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Menu</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {links.map((l) => {
                  const active = pathname === l.to || (l.to !== '/' && l.to !== '/dashboard' && pathname.startsWith(l.to));
                  return <SidebarNavLink key={l.to} item={l} active={active} />;
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="border-t pt-4">
          <div className="flex flex-col gap-2 group-data-[collapsible=icon]:items-center">
            {/* Utilities */}
            <div className="flex items-center justify-between w-full px-2 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:gap-2">
              <LanguageSwitcher />
              <ThemeToggle />
            </div>

            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton size="lg" className="w-full data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground">
                    <Avatar className="h-8 w-8 rounded-lg">
                      <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                      <span className="truncate font-semibold">{displayName}</span>
                      <span className="truncate text-xs">{roleLabel}</span>
                    </div>
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" side="right" sideOffset={8} className="w-56 rounded-lg">
                  <DropdownMenuLabel className="p-2">
                    <div className="font-semibold">{displayName}</div>
                    <div className="text-xs text-muted-foreground truncate opacity-80">{user.email}</div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild className="cursor-pointer">
                    <Link to={dashboardHref}>
                      <LayoutDashboard className="mr-2 h-4 w-4" /> Dashboard
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10" onClick={signOut}>
                    <LogOut className="mr-2 h-4 w-4" /> Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Link to="/login" className="group-data-[collapsible=icon]:hidden">
                <Button className="w-full gap-2">
                  <LogOut className="h-4 w-4" /> Login
                </Button>
              </Link>
            )}
          </div>
        </SidebarFooter>
      </Sidebar>

      <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} items={cmdItems} />
    </>
  );
}
`;

fs.writeFileSync(navPath, newContent, 'utf8');
console.log('Navbar rewritten successfully');
