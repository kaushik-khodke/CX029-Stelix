"""
Clinical Triage & ML Prediction Router
"""

import logging
from typing import Optional, Dict, Any
from fastapi import APIRouter
from pydantic import BaseModel

from ml_triage import predict_priority

logger = logging.getLogger("stelix")
router = APIRouter(tags=["Clinical Triage & ML"])


class TriageRequest(BaseModel):
    chief_complaint: str
    age: Optional[int] = 35
    systolic_bp: Optional[float] = 120.0
    diastolic_bp: Optional[float] = 80.0
    heart_rate: Optional[float] = 72.0
    spo2: Optional[float] = 98.0
    temp_celsius: Optional[float] = 37.0


@router.post("/predict-triage")
@router.post("/triage/analyze")
async def analyze_triage(req: TriageRequest):
    """
    Evaluates patient vital signs and chief complaint using Scikit-Learn / XGBoost ML model
    to return ESI Emergency Severity Index priority level and score.
    """
    try:
        priority_label, score = predict_priority(
            chief_complaint=req.chief_complaint,
            age=req.age or 35,
            sbp=req.systolic_bp or 120.0,
            dbp=req.diastolic_bp or 80.0,
            hr=req.heart_rate or 72.0,
            spo2=req.spo2 or 98.0,
            temp=req.temp_celsius or 37.0
        )
        return {
            "success": True,
            "priority": priority_label,
            "urgency_score": score,
            "metrics_evaluated": {
                "chief_complaint": req.chief_complaint,
                "vitals": {
                    "bp": f"{req.systolic_bp}/{req.diastolic_bp}",
                    "heart_rate": req.heart_rate,
                    "spo2": req.spo2
                }
            }
        }
    except Exception as e:
        logger.error(f"Triage prediction error: {e}", exc_info=True)
        return {
            "success": False,
            "priority": "YELLOW",
            "urgency_score": 50,
            "error": str(e)
        }
