import { useState, useMemo, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/Input";
import { Separator } from "@/components/ui/separator";
import { Command as CommandIcon } from "lucide-react";
import { useConsentsCount } from "@/hooks/useConsentsCount";

import { ThemeToggle } from "./ThemeToggle";
import { Button } from "../ui/Button";
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
  Bot,
  Globe,
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
import { Badge } from "../ui/Badge";

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
  SidebarRail,
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
  const handleClick = (e: React.MouseEvent) => {
    if (item.to.includes("#")) {
      const hashPart = item.to.split("#")[1];
      const el = document.getElementById(hashPart);
      if (el) {
        e.preventDefault();
        el.scrollIntoView({ behavior: "smooth" });
        window.history.pushState(null, "", item.to);
      }
    }
  };

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
        <Link to={item.to} onClick={handleClick} className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="shrink-0">{item.icon}</div>
            <span className="truncate group-data-[collapsible=icon]:hidden">{item.label}</span>
          </div>
          {typeof item.badge === "number" && item.badge > 0 && (
            <Badge variant="secondary" className="group-data-[collapsible=icon]:hidden shrink-0 bg-teal-500/15 text-teal-600 dark:text-teal-400 font-bold border border-teal-500/30">
              {item.badge}
            </Badge>
          )}
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export function Navbar() {
  const { user, profile, role, signOut } = useAuth();
  const { pendingCount: pendingConsents } = useConsentsCount();
  const location = useLocation();
  const navigate = useNavigate();
  const pathname = location.pathname;
  const { toggleSidebar, isMobile } = useSidebar();
  const [cmdOpen, setCmdOpen] = useState(false);
  const [activeLang, setActiveLang] = useState<string>('en');

  // Detect current translation language on mount
  useEffect(() => {
    const cookies = document.cookie.split(';');
    const gCookie = cookies.find(c => c.trim().startsWith('googtrans='));
    if (gCookie) {
      const val = gCookie.split('=')[1];
      if (val.includes('/hi')) setActiveLang('hi');
      else if (val.includes('/mr')) setActiveLang('mr');
      else setActiveLang('en');
    }
  }, []);

  useEffect(() => {
    const initTranslate = () => {
      const g = (window as any).google;
      if (g && g.translate && g.translate.TranslateElement) {
        try {
          const container = document.getElementById('google_translate_element');
          if (container && container.children.length === 0) {
            new g.translate.TranslateElement({
              pageLanguage: 'en',
              includedLanguages: 'en,hi,mr',
              layout: g.translate.TranslateElement.InlineLayout.SIMPLE,
              autoDisplay: false
            }, 'google_translate_element');
          }
        } catch (e) {
          // Already initialized
        }
      }
    };
    initTranslate();
    const timer = setTimeout(initTranslate, 1000);
    return () => clearTimeout(timer);
  }, []);

  // Derived Values
  const profileAny = profile as any;
  const displayName = profileAny?.firstName || profileAny?.first_name 
    ? `${profileAny.firstName || profileAny.first_name} ${profileAny.lastName || profileAny.last_name || ''}`.trim() 
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

  if (pathname === '/login' || pathname === '/signup' || pathname === '/') return null;

  // Links definitions
  const patientLinks: NavLinkItem[] = [
    { to: "/dashboard", icon: <LayoutDashboard className="h-4 w-4" />, label: "Dashboard" },
    { to: "/patient/my-medicines", icon: <FileText className="h-4 w-4" />, label: "My Medicines" },
    { to: "/patient/consent", icon: <ShieldCheck className="h-4 w-4" />, label: "Consents", badge: pendingConsents },
    { to: "/patient/routines", icon: <HeartPulse className="h-4 w-4" />, label: "Health Tracker" },
    { to: "/patient/records", icon: <FileText className="h-4 w-4" />, label: "Medical Records" },
    { to: "/patient/pharmacy-chat", icon: <Bot className="h-4 w-4 text-emerald-500" />, label: "Expert Pharmacy" },
  ];

  const doctorLinks: NavLinkItem[] = [
    { to: "/doctor", icon: <LayoutDashboard className="h-4 w-4" />, label: "Dashboard" },
    { to: "/doctor#my-patients", icon: <UserCircle2 className="h-4 w-4" />, label: "My Patients" },
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
    { label: "Dashboard", to: dashboardHref },
    ...links.map(l => ({
      label: l.label,
      to: l.to
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
        <SidebarHeader className="h-16 flex flex-row items-center justify-between border-b px-4 group-data-[collapsible=icon]:!px-0 group-data-[collapsible=icon]:justify-center">
          <button onClick={() => toggleSidebar()} className="flex items-center gap-3 overflow-hidden group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:w-full hover:opacity-80 transition-opacity text-left">
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
          </button>
          <SidebarTrigger className="group-data-[collapsible=icon]:hidden" />
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
            <div className="flex flex-col gap-2 w-full px-2">
              <div className="flex items-center justify-between w-full group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:gap-2">
                <ThemeToggle />
              </div>
              {/* Inline Language Switcher */}
              <div className="group-data-[collapsible=icon]:hidden">
                <div className="flex items-center gap-1 p-1 rounded-xl bg-muted/60 border border-border/50">
                  {[
                    { code: 'en', flag: '🇬🇧', label: 'EN' },
                    { code: 'hi', flag: '🇮🇳', label: 'HI' },
                    { code: 'mr', flag: '🇮🇳', label: 'MR' },
                  ].map(({ code, flag, label }) => (
                    <button
                      key={code}
                      type="button"
                      onClick={() => {
                        setActiveLang(code);
                        const selectElem = document.querySelector('select.goog-te-combo') as HTMLSelectElement;
                        if (selectElem) {
                          selectElem.value = code;
                          selectElem.dispatchEvent(new Event('change'));
                        }
                        const domain = window.location.hostname;
                        document.cookie = `googtrans=/en/${code}; path=/`;
                        if (domain !== 'localhost') {
                          document.cookie = `googtrans=/en/${code}; domain=${domain}; path=/`;
                        }
                        if (!selectElem) window.location.reload();
                      }}
                      className={`flex-1 flex items-center justify-center gap-1 py-1 rounded-lg text-[11px] font-bold transition-all ${
                        activeLang === code
                          ? 'bg-emerald-500 text-white shadow-sm'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                      }`}
                      title={code === 'en' ? 'English' : code === 'hi' ? 'Hindi (हिंदी)' : 'Marathi (मराठी)'}
                    >
                      <span>{flag}</span>
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              </div>
              {/* Hidden Google Translate element (keeps translation engine alive) */}
              <div id="google_translate_element" className="hidden"></div>
            </div>

            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton size="lg" className="w-full data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground">
                    <Avatar className="h-8 w-8 rounded-lg">
                      <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left text-sm leading-tight overflow-hidden group-data-[collapsible=icon]:hidden">
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
        <SidebarRail />
      </Sidebar>

      <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} items={cmdItems} />
    </>
  );
}




function CommandPalette({
  open,
  onOpenChange,
  items,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  items: Array<{ label: string; hint?: string; to: string }>;
}) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter(
      (i) => i.label.toLowerCase().includes(s) || i.to.toLowerCase().includes(s) || (i.hint ?? "").toLowerCase().includes(s)
    );
  }, [q, items]);

  // Reset search when opening/closing (UX)
  useEffect(() => {
    if (!open) setQ("");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] p-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle className="flex items-center gap-2">
            <CommandIcon className="h-5 w-5" />
            Quick Search
          </DialogTitle>
        </DialogHeader>

        <div className="px-4 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search pages (e.g., consent, records, scan)"
              className="pl-9"
              autoFocus
            />
          </div>
        </div>

        <Separator />

        <div className="max-h-[320px] overflow-auto p-2">
          {filtered.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">No results.</div>
          ) : (
            filtered.map((i) => (
              <button
                key={i.to}
                onClick={() => {
                  onOpenChange(false);
                  navigate(i.to);
                }}
                className="w-full text-left flex items-center justify-between gap-3 px-3 py-2 rounded-lg hover:bg-muted/60 transition-colors"
              >
                <span className="font-medium">{i.label}</span>
                <span className="text-xs text-muted-foreground">{i.hint ?? i.to}</span>
              </button>
            ))
          )}
        </div>

        <div className="px-4 py-3 bg-muted/30 text-xs text-muted-foreground flex items-center justify-between">
          <span>Tip: Use Ctrl/Γîÿ + K and Enter (click works too).</span>
          <span className="font-mono">Esc</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

