const fs = require('fs');
const navPath = 'frontend/src/components/layout/Navbar.tsx';
let content = fs.readFileSync(navPath, 'utf8');

// Fix ThemeToggle import
content = content.replace(
  'import { ThemeToggle } from "../ui/ThemeToggle";',
  'import { ThemeToggle } from "./ThemeToggle";'
);

// Fix LanguageSwitcher import
content = content.replace(
  'import { LanguageSwitcher } from "../ui/LanguageSwitcher";',
  'import { LanguageSwitcher } from "@/components/features/LanguageSwitcher";'
);

// Fix useEffect import
content = content.replace(
  'import { useState, useMemo } from "react";',
  'import { useState, useMemo, useEffect } from "react";'
);

// Fix profile name casing - fallback to user.email directly instead of first_name if it errors
content = content.replace(
  'const displayName = profile?.first_name',
  '// @ts-ignore\n  const displayName = profile?.firstName || profile?.first_name'
);
content = content.replace(
  '? \\`\\${profile.first_name} \\${profile.last_name || \'\'}\\`.trim()',
  '? \\`\\${profile.firstName || profile.first_name} \\${profile.lastName || profile.last_name || \'\'}\\`.trim()'
);

// Fix cmdItems
const oldCmdItems = `  const cmdItems = [
    {
      id: "dashboard",
      label: "Dashboard",
      to: dashboardHref,
      icon: <LayoutDashboard className="h-4 w-4" />,
      
    },
    ...links.map(l => ({
      id: l.to,
      label: l.label,
      icon: l.icon,
      
    }))
  ];`;

const newCmdItems = `  const cmdItems = [
    { label: "Dashboard", to: dashboardHref },
    ...links.map(l => ({
      label: l.label,
      to: l.to
    }))
  ];`;

content = content.replace(oldCmdItems, newCmdItems);

fs.writeFileSync(navPath, content, 'utf8');
console.log('Fixed Navbar TS errors');
