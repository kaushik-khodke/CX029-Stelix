"""
Inflow Forecast & Seasonal Demand Service
"""

import math
import logging
from datetime import datetime, timedelta
from typing import Dict, Any, List

logger = logging.getLogger("stelix")


def calculate_seasonal_inflow_forecast(
    base_daily_inflow: float = 120.0,
    days_ahead: int = 14,
    current_season: str = "Summer"
) -> List[Dict[str, Any]]:
    """
    Computes a 4-signal forecast model considering:
    1. Base historical inflow
    2. Seasonal multipliers (Monsoon +35%, Summer +15%, Winter +25%)
    3. Day of week variance (Mondays peak)
    4. Sinusoidal trend oscillation
    """
    season_multipliers = {
        "Monsoon": 1.35,
        "Summer": 1.15,
        "Winter": 1.25,
        "Spring": 1.05
    }

    multiplier = season_multipliers.get(current_season, 1.10)
    forecast = []
    today = datetime.now()

    for i in range(days_ahead):
        target_date = today + timedelta(days=i)
        day_name = target_date.strftime("%a")

        # Weekend drop / Monday surge factor
        dow_factor = 1.20 if target_date.weekday() == 0 else (0.85 if target_date.weekday() in [5, 6] else 1.0)
        oscillation = math.sin(i / 2.0) * 8.0

        projected_count = int(round((base_daily_inflow * multiplier * dow_factor) + oscillation))

        forecast.append({
            "date": target_date.strftime("%Y-%m-%d"),
            "day": day_name,
            "projected_inflow": projected_count,
            "confidence_lower": int(projected_count * 0.90),
            "confidence_upper": int(projected_count * 1.10),
            "dominant_season": current_season
        })

    return forecast
