import React from "react";
import { Apple, Ban } from "lucide-react";

interface NutritionFood {
  food: string;
  reason?: string;
}

interface NutritionSectionProps {
  rationale?: string;
  foodsToEat?: (string | NutritionFood)[];
  foodsToAvoid?: (string | NutritionFood)[];
}

export const NutritionSection: React.FC<NutritionSectionProps> = ({
  rationale,
  foodsToEat = [],
  foodsToAvoid = [],
}) => {
  return (
    <div className="rounded-2xl border border-border/50 bg-card p-6 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <Apple className="w-5 h-5 text-emerald-500" />
        <h3 className="font-bold text-foreground text-lg">Personalized Nutrition Plan</h3>
      </div>

      {rationale && (
        <p className="text-sm text-muted-foreground mb-6 leading-relaxed bg-muted/30 p-3 rounded-xl border border-border/40">
          {rationale}
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Recommended */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-semibold text-sm">
            <Apple className="w-4 h-4" /> Recommended Foods
          </div>
          <div className="space-y-2">
            {foodsToEat.map((item, i) => {
              const name = typeof item === "string" ? item : item.food;
              const reason = typeof item === "string" ? "" : item.reason;
              return (
                <div key={i} className="p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 text-sm">
                  <p className="font-semibold text-foreground">{name}</p>
                  {reason && <p className="text-xs text-muted-foreground mt-0.5">{reason}</p>}
                </div>
              );
            })}
          </div>
        </div>

        {/* Avoid */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-red-500 font-semibold text-sm">
            <Ban className="w-4 h-4" /> Foods to Limit / Avoid
          </div>
          <div className="space-y-2">
            {foodsToAvoid.map((item, i) => {
              const name = typeof item === "string" ? item : item.food;
              const reason = typeof item === "string" ? "" : item.reason;
              return (
                <div key={i} className="p-3 rounded-xl border border-red-500/20 bg-red-500/5 text-sm">
                  <p className="font-semibold text-foreground">{name}</p>
                  {reason && <p className="text-xs text-muted-foreground mt-0.5">{reason}</p>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
