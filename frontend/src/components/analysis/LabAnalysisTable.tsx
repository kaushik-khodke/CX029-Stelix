import React from "react";
import { CheckCircle2, AlertCircle } from "lucide-react";

export interface LabItem {
  test_name: string;
  result: string;
  normal_range: string;
  status: string;
  interpretation?: string;
  recommendation?: string;
}

interface LabAnalysisTableProps {
  labs: LabItem[];
}

export const LabAnalysisTable: React.FC<LabAnalysisTableProps> = ({ labs }) => {
  if (!labs || labs.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border/50 bg-card overflow-hidden mb-6">
      <div className="p-4 border-b border-border/40 bg-muted/20">
        <h3 className="font-bold text-foreground text-base">Lab Test Analysis</h3>
      </div>
      <div className="divide-y divide-border/40">
        {labs.map((lab, i) => {
          const isNormal = lab.status?.toLowerCase().includes("normal");
          return (
            <div key={i} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-foreground">{lab.test_name}</p>
                  <span
                    className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${
                      isNormal ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"
                    }`}
                  >
                    {isNormal ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                    {lab.status}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Range: {lab.normal_range} {lab.interpretation && `• ${lab.interpretation}`}
                </p>
              </div>
              <div className="text-right sm:text-right">
                <span className="text-lg font-bold text-foreground font-heading">{lab.result}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
