import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./useAuth";

export function useConsentsCount() {
  const { user, role } = useAuth();
  const [pendingCount, setPendingCount] = useState<number>(0);

  const fetchCount = useCallback(async () => {
    if (!user || role !== "patient") {
      setPendingCount(0);
      return;
    }

    try {
      // 1) Find patient row id if available
      const { data: patient } = await supabase
        .from("patients")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      const patientId = patient?.id;

      // Build query for pending consents
      let query = supabase
        .from("consent_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");

      if (patientId && patientId !== user.id) {
        query = query.or(`patient_id.eq.${user.id},patient_id.eq.${patientId}`);
      } else {
        query = query.eq("patient_id", user.id);
      }

      const { count, error } = await query;

      if (!error && typeof count === "number") {
        setPendingCount(count);
      }
    } catch (err) {
      console.error("Error fetching pending consents count:", err);
    }
  }, [user, role]);

  useEffect(() => {
    fetchCount();

    // Custom event listener for instant local updates across the app
    const handleCustomUpdate = () => fetchCount();
    window.addEventListener("consent-updated", handleCustomUpdate);

    // Supabase Realtime Subscription for live multi-tab / remote updates
    const channel = supabase
      .channel("consent-requests-badge-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "consent_requests" },
        () => {
          fetchCount();
        }
      )
      .subscribe();

    return () => {
      window.removeEventListener("consent-updated", handleCustomUpdate);
      supabase.removeChannel(channel);
    };
  }, [fetchCount]);

  return { pendingCount, refreshConsentsCount: fetchCount };
}

// Utility function to trigger app-wide consent count refresh
export function triggerConsentUpdate() {
  window.dispatchEvent(new Event("consent-updated"));
}
