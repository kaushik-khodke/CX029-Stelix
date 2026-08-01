"""
Bed Capacity & Hospital Pressure Calculation Service
"""

import logging
from typing import Dict, Any

logger = logging.getLogger("stelix")


def compute_bed_occupancy_pressure(
    occupied_icu: int,
    total_icu: int,
    occupied_general: int,
    total_general: int,
    occupied_ventilators: int,
    total_ventilators: int
) -> Dict[str, Any]:
    """
    Computes weighted hospital pressure metrics and alert status.
    """
    icu_pct = (occupied_icu / max(1, total_icu)) * 100.0
    general_pct = (occupied_general / max(1, total_general)) * 100.0
    vent_pct = (occupied_ventilators / max(1, total_ventilators)) * 100.0

    # Weighted Pressure Index (ICU 45%, Ventilator 35%, General 20%)
    overall_pressure_index = (icu_pct * 0.45) + (vent_pct * 0.35) + (general_pct * 0.20)

    if overall_pressure_index >= 85.0:
        status_label = "CRITICAL_CAPACITY"
        recommended_action = "Initiate emergency triage redirection and activate backup ICU wing."
    elif overall_pressure_index >= 70.0:
        status_label = "HIGH_LOAD"
        recommended_action = "Prepare elective discharge and reallocate general ward staff."
    else:
        status_label = "NORMAL"
        recommended_action = "Routine operational monitoring."

    return {
        "pressure_index": round(overall_pressure_index, 1),
        "status": status_label,
        "recommended_action": recommended_action,
        "breakdown": {
            "icu": {"occupied": occupied_icu, "total": total_icu, "percentage": round(icu_pct, 1)},
            "general": {"occupied": occupied_general, "total": total_general, "percentage": round(general_pct, 1)},
            "ventilators": {"occupied": occupied_ventilators, "total": total_ventilators, "percentage": round(vent_pct, 1)},
        }
    }
