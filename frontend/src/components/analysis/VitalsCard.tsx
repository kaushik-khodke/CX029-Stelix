import React from "react";
import { Activity, Heart, Thermometer, Droplet } from "lucide-react";

interface VitalsCardProps {
  bp: string;
  sugar: string;
  heartRate: string;
  spo2?: string;
}

export const VitalsCard: React.FC<VitalsCardProps> = ({
  bp,
  sugar,
  heartRate,
  spo2 = "98%",
}) => {
  const items = [
    { label: "Blood Pressure", value: bp, icon: Activity, color: "text-blue-500", bg: "bg-blue-50 dark:bg-blue-950/40" },
    { label: "Blood Sugar", value: sugar, icon: Droplet, color: "text-amber-500", bg: "bg-amber-50 dark:bg-amber-950/40" },
    { label: "Heart Rate", value: heartRate, icon: Heart, color: "text-red-500", bg: "bg-red-50 dark:bg-red-950/40" },
    { label: "Oxygen SpO2", value: spo2, icon: Thermometer, color: "text-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-950/40" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
      {items.map((item, index) => {
        const Icon = item.icon;
        return (
          <div
            key={index}
            className={`p-4 rounded-2xl border border-border/50 ${item.bg} backdrop-blur-sm transition-all hover:scale-[1.02]`}
          >
            <div className="flex items-center gap-2 mb-2">
              <Icon className={`w-4 h-4 ${item.color}`} />
              <span className="text-xs font-medium text-muted-foreground">{item.label}</span>
            </div>
            <p className="text-xl font-bold text-foreground font-heading">{item.value}</p>
          </div>
        );
      })}
    </div>
  );
};
