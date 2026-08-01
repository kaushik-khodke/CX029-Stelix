const fs = require('fs');

const oldPath = 'old_navbar.tsx';
const navPath = 'frontend/src/components/layout/Navbar.tsx';

let oldContent = fs.readFileSync(oldPath, 'utf16le');
let newContent = fs.readFileSync(navPath, 'utf8');

const startIdx = oldContent.indexOf("function CommandPalette");
const endIdx = oldContent.indexOf("export function Navbar");

if (startIdx === -1 || endIdx === -1) {
  console.error("Could not find CommandPalette boundaries");
  process.exit(1);
}

const commandPaletteCode = oldContent.substring(startIdx, endIdx);

const importsToAdd = `
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/Input";
import { Separator } from "@/components/ui/separator";
import { Command as CommandIcon } from "lucide-react";
import { useConsentsCount } from "@/hooks/useConsentsCount";
`;

newContent = newContent.replace(
  'import { useAuth } from "@/contexts/AuthContext";',
  'import { useAuth } from "@/hooks/useAuth";'
);
newContent = newContent.replace(
  'import { CommandPalette } from "../ui/CommandPalette";\n',
  ''
);

newContent = newContent.replace(
  'import { useAuth } from "@/hooks/useAuth";',
  'import { useAuth } from "@/hooks/useAuth";\n' + importsToAdd
);

// Ah wait, pendingConsents is now from useConsentsCount
newContent = newContent.replace(
  'const { user, profile, role, pendingConsents, signOut } = useAuth();',
  'const { user, profile, role, signOut } = useAuth();\n  const { pendingCount: pendingConsents } = useConsentsCount();'
);

newContent = newContent.replace(
  'title: l.label,',
  'label: l.label,'
).replace(
  'onSelect: () => navigate(l.to),',
  ''
);
newContent = newContent.replace(
  'title: "Dashboard",',
  'label: "Dashboard",\n      to: dashboardHref,'
);

newContent = newContent + '\n\n' + commandPaletteCode;

fs.writeFileSync(navPath, newContent, 'utf8');
console.log('Fixed Navbar.tsx successfully');
