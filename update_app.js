const fs = require('fs');

const appTsxPath = 'frontend/src/App.tsx';
let content = fs.readFileSync(appTsxPath, 'utf8');

if (!content.includes('import { SidebarProvider }')) {
  content = content.replace(
    'import { GlobalAlertContainer } from "@/components/layout/GlobalAlertContainer";',
    'import { SidebarProvider } from "@/components/ui/sidebar";\nimport { GlobalAlertContainer } from "@/components/layout/GlobalAlertContainer";'
  );
}

const targetReturn = `  return (
    <div className="min-h-screen text-foreground">
      {!isLanding && <Navbar />}
      <GlobalAlertContainer />
      <MedicineReminder />
      <main className={isLanding ? "min-h-screen relative" : "pt-16 md:pt-0 md:pl-64 min-h-screen relative"}>`;

const replacementReturn = `  return (
    <SidebarProvider>
      {!isLanding && <Navbar />}
      <div className="flex flex-col flex-1 min-w-0 w-full min-h-screen text-foreground">
        <GlobalAlertContainer />
        <MedicineReminder />
        <main className="flex-1 w-full relative">`;

content = content.replace(targetReturn, replacementReturn);

const targetEnd = `      </main>
    </div>
  );`;

const replacementEnd = `      </main>
      </div>
    </SidebarProvider>
  );`;

content = content.replace(targetEnd, replacementEnd);

fs.writeFileSync(appTsxPath, content, 'utf8');
console.log('App.tsx updated');
