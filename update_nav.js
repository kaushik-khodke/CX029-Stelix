const fs = require('fs');

const filePath = 'frontend/src/components/layout/Navbar.tsx';
let content = fs.readFileSync(filePath, 'utf-8');

const targetStr = "if (pathname === '/login' || pathname === '/signup') return null;";
const index = content.indexOf(targetStr);

if (index === -1) {
    console.error("Could not find the target string.");
    process.exit(1);
}

const preReturn = content.substring(0, index);

const newReturnBlock = `if (pathname === '/login' || pathname === '/signup') return null;

  return (
    <>
      {/* MOBILE TOP BAR */}
      <motion.header
        className="md:hidden fixed top-0 inset-x-0 z-50"
        initial={{ y: 0 }}
        animate={{ y: isVisible ? 0 : -100 }}
        transition={{ duration: 0.3, ease: "easeInOut" }}
      >
        <div className="glass-panel border-b border-border/40 bg-background/90 backdrop-blur-md">
          <div className="w-full px-4 h-16 flex items-center justify-between gap-3">
            {/* Brand */}
            <Link to="/" className="flex items-center gap-2 min-w-[150px]">
              <div className="relative h-8 w-8 rounded-lg bg-gradient-to-br from-blue-600 via-teal-500 to-emerald-500 flex items-center justify-center shadow-lg">
                <Activity className="w-4 h-4 text-white" />
              </div>
              <div className="font-black font-heading text-lg tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-blue-700 via-teal-500 to-emerald-600 dark:from-blue-400 dark:via-teal-300 dark:to-emerald-400">
                MyHealth<span className="opacity-80 font-bold text-teal-600 dark:text-teal-400">Chain</span>
              </div>
            </Link>

            {/* Mobile Actions */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCmdOpen(true)}
                className="h-9 w-9 rounded-xl border bg-background hover:bg-muted/40 transition-colors flex items-center justify-center"
                aria-label="Search"
              >
                <Search className="h-4 w-4 text-muted-foreground" />
              </button>
              {user ? (
                <button
                  className="relative h-9 w-9 rounded-xl border bg-background hover:bg-muted/40 transition-all flex items-center justify-center"
                  aria-label="Notifications"
                  onClick={() => navigate(role === "patient" ? "/patient/consent" : dashboardHref)}
                >
                  <Bell className="h-4 w-4 text-muted-foreground" />
                  {pendingConsents > 0 ? (
                    <span className="absolute -top-1 -right-1 h-4 min-w-[16px] px-1 rounded-full bg-red-500 text-white text-[9px] font-bold shadow-sm flex items-center justify-center animate-pulse">
                      {pendingConsents}
                    </span>
                  ) : null}
                </button>
              ) : null}
              
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="rounded-xl ml-1">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-[330px] p-0 flex flex-col">
                  <SheetHeader className="p-4 border-b text-left">
                    <SheetTitle className="flex items-center justify-between font-heading">
                      Menu
                      <ThemeToggle />
                    </SheetTitle>
                  </SheetHeader>
                  <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {links.map((l) => (
                      <SidebarNavItem key={l.to} item={l} />
                    ))}
                  </div>
                  <div className="p-4 border-t">
                    {user ? (
                      <div className="space-y-4">
                        <div className="p-4 rounded-2xl bg-muted/30 border border-border/50">
                          <div className="text-sm font-semibold text-foreground">{displayName}</div>
                          <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mt-0.5">
                            {roleLabel}
                          </div>
                        </div>
                        <Button variant="destructive" className="w-full gap-2 rounded-xl h-11" onClick={signOut}>
                          <LogOut className="h-4 w-4" /> Logout
                        </Button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-3">
                        <Link to="/login"><Button variant="outline" className="w-full rounded-xl h-11">Login</Button></Link>
                        <Link to="/signup"><Button className="w-full rounded-xl h-11 gradient-primary border-0">Sign Up</Button></Link>
                      </div>
                    )}
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>
      </motion.header>

      {/* DESKTOP SIDEBAR */}
      <aside className="hidden md:flex w-64 h-screen fixed left-0 top-0 z-40 flex-col bg-background/95 backdrop-blur-xl border-r border-border/40 shadow-[4px_0_24px_rgba(0,0,0,0.02)] dark:shadow-none">
        {/* Brand */}
        <div className="h-16 px-6 flex items-center shrink-0 border-b border-border/40">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="relative">
              <div className="absolute inset-0 bg-primary/30 blur-lg rounded-full group-hover:bg-primary/50 transition-all duration-500" />
              <motion.div
                whileHover={{ scale: 1.05 }}
                className="relative h-9 w-9 rounded-xl bg-gradient-to-br from-blue-600 via-teal-500 to-emerald-500 flex items-center justify-center shadow-lg shadow-primary/25"
              >
                <Activity className="w-4 h-4 text-white" />
              </motion.div>
            </div>
            <div className="leading-tight">
              <div className="font-black font-heading text-lg tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-blue-700 via-teal-500 to-emerald-600 dark:from-blue-400 dark:via-teal-300 dark:to-emerald-400">
                MyHealth<span className="opacity-80 font-bold text-teal-600 dark:text-teal-400">Chain</span>
              </div>
            </div>
          </Link>
        </div>

        {/* Navigation */}
        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-1.5 custom-scrollbar">
          <div className="mb-4 px-2">
            <button
              onClick={() => setCmdOpen(true)}
              className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border bg-muted/30 hover:bg-muted/60 transition-all duration-200 text-left"
            >
              <Search className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground flex-1">Search...</span>
              <kbd className="hidden xl:inline-flex pointer-events-none h-5 select-none items-center gap-1 rounded border bg-background px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
                <span className="text-xs">⌘</span>K
              </kbd>
            </button>
          </div>

          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-2">
            Menu
          </div>
          {links.map((l) => (
            <SidebarNavItem key={l.to} item={l} />
          ))}
        </div>

        {/* Bottom actions */}
        <div className="p-4 shrink-0 border-t border-border/40 bg-muted/10">
          <div className="flex items-center justify-between mb-4 px-2">
            <LanguageSwitcher />
            <div className="flex items-center gap-2">
              {user && (
                <button
                  className="relative h-8 w-8 rounded-lg hover:bg-muted transition-all flex items-center justify-center"
                  aria-label="Notifications"
                  onClick={() => navigate(role === "patient" ? "/patient/consent" : dashboardHref)}
                >
                  <Bell className="h-4 w-4 text-muted-foreground" />
                  {pendingConsents > 0 && (
                    <span className="absolute -top-1 -right-1 h-3.5 min-w-[14px] px-1 rounded-full bg-red-500 text-white text-[9px] font-bold shadow-sm flex items-center justify-center animate-pulse">
                      {pendingConsents}
                    </span>
                  )}
                </button>
              )}
              <ThemeToggle />
            </div>
          </div>

          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="w-full flex items-center gap-3 rounded-2xl border border-border/50 bg-background hover:bg-muted/50 transition-all p-2 group">
                  <Avatar className="h-10 w-10 ring-2 ring-background shadow-sm">
                    <AvatarFallback className="text-sm font-bold bg-primary/10 text-primary">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 text-left overflow-hidden">
                    <div className="text-sm font-semibold leading-none truncate group-hover:text-primary transition-colors">
                      {displayName}
                    </div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mt-1 truncate">
                      {roleLabel}
                    </div>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="right" sideOffset={12} className="w-60 p-2 rounded-2xl glass-card">
                <DropdownMenuLabel className="p-2">
                  <div className="text-sm font-semibold">{displayName}</div>
                  <div className="text-xs text-muted-foreground truncate font-normal opacity-80">
                    {user.email}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="my-1" />
                <DropdownMenuItem asChild className="rounded-lg cursor-pointer py-2.5">
                  <Link to={dashboardHref}>
                    <Activity className="mr-2 h-4 w-4" /> Dashboard
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator className="my-1" />
                <DropdownMenuItem asChild className="rounded-lg cursor-pointer py-2.5 text-destructive focus:text-destructive focus:bg-destructive/10" onClick={signOut}>
                  <div><LogOut className="mr-2 h-4 w-4" /> Logout</div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Link to="/login">
              <Button className="w-full rounded-xl gap-2 shadow-sm">
                <LogOut className="h-4 w-4" /> Login
              </Button>
            </Link>
          )}
        </div>
      </aside>

      <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} items={cmdItems} />
    </>
  );
}
`;

fs.writeFileSync(filePath, preReturn + newReturnBlock, 'utf-8');
console.log('Successfully updated Navbar.tsx');
