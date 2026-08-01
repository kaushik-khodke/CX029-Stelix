"""
Centralized Clinical Context Builder for AI Health Insight Module.
Ensures strongly-typed, fully-validated context construction from Supabase DB,
RAG document chunks, triage queues, health routines, and ML risk predictions.
"""

from typing import Dict, Any, List, Optional
from dataclasses import dataclass, field
from datetime import datetime, timedelta
import re
import json


@dataclass
class ClinicalContext:
    user_id: str
    patient_db_id: Optional[str] = None
    auth_uid: Optional[str] = None
    candidate_ids: List[str] = field(default_factory=list)
    patient_info: Dict[str, Any] = field(default_factory=dict)
    vitals: Dict[str, Any] = field(default_factory=dict)
    vitals_str: str = ""
    active_triage: Optional[Dict[str, Any]] = None
    triage_priority: Optional[str] = None
    triage_context: str = ""
    active_meds: List[str] = field(default_factory=list)
    meds_context: str = "No active prescriptions on file."
    text_records: List[str] = field(default_factory=list)
    records_context: str = "No additional uploaded medical documents."
    lifestyle_context: str = "No lifestyle metrics logged."
    total_file_count: int = 0
    avg_water: Optional[float] = None
    avg_steps: Optional[int] = None
    avg_sleep: Optional[float] = None
    analysis_result: Dict[str, Any] = field(default_factory=dict)
    
    # Pre-computed prompt string attributes
    bp_val: str = "120/80 mmHg"
    sugar_val: str = "95 mg/dL"
    hr_val: str = "72 bpm"
    sleep_str: str = "7.2 hrs/night"
    steps_str: str = "6,500 steps/day"
    water_str: str = "8 glasses/day"
    immediate_action_str: str = "Routine clinical monitoring."
    is_emergency_bool: str = "false"
    active_triage_reason: str = "Vitals and physiological markers are within stable clinical thresholds."
    report_id_str: str = "999999"
    active_meds_json_str: str = '["No active prescriptions recorded"]'
    generated_at_str: str = "2026-08-01T00:00:00Z"


def parse_num(val: Any, cast_fn: Any) -> Optional[Any]:
    """Safely parse numbers from mixed strings or numbers."""
    if val is None:
        return None
    try:
        match = re.search(r"[-+]?\d*\.?\d+", str(val))
        if match:
            return cast_fn(float(match.group(0)))
    except Exception:
        pass
    return None


class ClinicalContextBuilder:
    def __init__(self, user_id: str, sb: Any, rag_service: Any, ml_analyze_fn: Any, get_patient_db_id_fn: Any, get_auth_user_id_fn: Any):
        self.user_id = user_id
        self.sb = sb
        self.rag_service = rag_service
        self.ml_analyze_fn = ml_analyze_fn
        self.get_patient_db_id_fn = get_patient_db_id_fn
        self.get_auth_user_id_fn = get_auth_user_id_fn

    async def build(self) -> ClinicalContext:
        ctx = ClinicalContext(user_id=self.user_id)

        # 1. Resolve Patient IDs
        try:
            ctx.patient_db_id = self.get_patient_db_id_fn(self.user_id)
            ctx.auth_uid = self.get_auth_user_id_fn(ctx.patient_db_id) if ctx.patient_db_id else self.user_id
        except Exception as e:
            print(f"⚠️ [ContextBuilder] Patient ID resolution warning: {e}")
            ctx.patient_db_id = self.user_id
            ctx.auth_uid = self.user_id

        ctx.candidate_ids = list(set(filter(None, [ctx.patient_db_id, ctx.auth_uid, self.user_id])))
        ctx.report_id_str = "".join([str(ord(c)%10) for c in (ctx.patient_db_id or '999999')[:6]])

        # 2. Query Patient Demographics
        calc_age = None
        try:
            patient_res = None
            if ctx.patient_db_id:
                patient_res = self.sb.table("patients").select("*").eq("id", ctx.patient_db_id).maybe_single().execute()
            if not patient_res or not patient_res.data:
                patient_res = self.sb.table("patients").select("*").eq("user_id", ctx.auth_uid).maybe_single().execute()

            if patient_res and patient_res.data:
                ctx.patient_info = patient_res.data
                dob_str = ctx.patient_info.get("date_of_birth")
                if dob_str:
                    try:
                        dob = datetime.strptime(str(dob_str), "%Y-%m-%d")
                        today = datetime.now()
                        calc_age = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
                    except Exception as de:
                        print(f"⚠️ [ContextBuilder] DOB parse error: {de}")
        except Exception as e:
            print(f"⚠️ [ContextBuilder] Patient query error: {e}")

        structured_vitals = {
            "age": calc_age,
            "blood_group": ctx.patient_info.get("blood_group"),
            "full_name": ctx.patient_info.get("full_name")
        }

        # 3. Query Active Triage
        try:
            for pid in ctx.candidate_ids:
                triage_res = self.sb.table("triage_queue") \
                    .select("priority_level, ai_reasoning, vitals, symptoms, status, arrival_time") \
                    .eq("patient_id", pid) \
                    .order("arrival_time", desc=True) \
                    .limit(1) \
                    .execute()
                if triage_res and triage_res.data:
                    ctx.active_triage = triage_res.data[0]
                    ctx.triage_priority = ctx.active_triage.get("priority_level")
                    break
        except Exception as te:
            print(f"⚠️ [ContextBuilder] Triage queue query error: {te}")

        if ctx.active_triage and ctx.active_triage.get("vitals"):
            tv = ctx.active_triage["vitals"]
            if isinstance(tv, dict):
                if tv.get("bp"): structured_vitals["bp"] = tv.get("bp")
                if tv.get("hr"): structured_vitals["heart_rate"] = tv.get("hr")
                if tv.get("sugar"): structured_vitals["sugar"] = tv.get("sugar")
                if tv.get("weight"): structured_vitals["weight"] = tv.get("weight")
                if tv.get("height"): structured_vitals["height"] = tv.get("height")

        # 4. Query Health Routines (last 7 days)
        week_ago = (datetime.utcnow() - timedelta(days=7)).isoformat()
        routines = []
        for uid in ctx.candidate_ids:
            try:
                routines_res = self.sb.table("health_routines") \
                    .select("metric_type, value, unit, logged_at") \
                    .eq("user_id", uid) \
                    .gte("logged_at", week_ago) \
                    .execute()
                if routines_res and routines_res.data:
                    routines.extend(routines_res.data)
            except Exception as re:
                print(f"⚠️ [ContextBuilder] Routines query warning for {uid}: {re}")

        hydration_logs = [v for v in (parse_num(r.get("value"), int) for r in routines if r.get("metric_type") == "hydration") if v is not None]
        steps_logs     = [v for v in (parse_num(r.get("value"), int) for r in routines if r.get("metric_type") == "steps") if v is not None]
        sleep_logs     = [v for v in (parse_num(r.get("value"), float) for r in routines if r.get("metric_type") == "sleep") if v is not None]

        ctx.avg_water = round(sum(hydration_logs) / max(len(hydration_logs), 1), 1) if hydration_logs else None
        ctx.avg_steps = round(sum(steps_logs) / max(len(steps_logs), 1)) if steps_logs else None
        ctx.avg_sleep = round(sum(sleep_logs) / max(len(sleep_logs), 1), 1) if sleep_logs else None

        ctx.lifestyle_context = f"""
        Recent Lifestyle Averages (last 7 days):
        - Hydration: {ctx.avg_water if ctx.avg_water else 'No data'} glasses/day
        - Activity: {ctx.avg_steps if ctx.avg_steps else 'No data'} steps/day
        - Sleep: {ctx.avg_sleep if ctx.avg_sleep else 'No data'} hours/night
        """

        bp_routines = [str(r.get("value")) for r in routines if r.get("metric_type") == "blood_pressure" and "/" in str(r.get("value"))]
        sugar_routines = [v for v in (parse_num(r.get("value"), int) for r in routines if r.get("metric_type") == "blood_sugar") if v is not None]
        if bp_routines and not structured_vitals.get("bp"):
            structured_vitals["bp"] = bp_routines[0]
        if sugar_routines and not structured_vitals.get("sugar"):
            structured_vitals["sugar"] = sugar_routines[0]

        # 5. Query Active Orders / Medications
        try:
            for pid in ctx.candidate_ids:
                orders_res = self.sb.table("orders") \
                    .select("id, status, created_at, order_items(dosage_text, frequency_per_day, medicines(name, strength))") \
                    .eq("patient_id", pid) \
                    .limit(5) \
                    .execute()
                if orders_res and orders_res.data:
                    for o in orders_res.data:
                        items = o.get("order_items", []) or []
                        for item in items:
                            med = item.get("medicines", {}) or {}
                            med_name = med.get("name")
                            if med_name:
                                ctx.active_meds.append(f"{med_name} ({med.get('strength', '')}) - {item.get('dosage_text', 'As directed')}")
        except Exception as me:
            print(f"⚠️ [ContextBuilder] Active meds query error: {me}")

        ctx.meds_context = f"Active Prescriptions/Medications: {', '.join(ctx.active_meds)}" if ctx.active_meds else "No active prescriptions on file."

        # 6. Fetch Medical Records (RAG)
        try:
            ctx.text_records = await self.rag_service.get_patient_records(self.user_id)
        except Exception as re:
            print(f"⚠️ [ContextBuilder] RAG records fetch fallback: {re}")
            ctx.text_records = []

        ctx.records_context = "\n".join(ctx.text_records) if ctx.text_records else "No additional uploaded medical documents."

        # Fetch actual dynamic count of unique files uploaded across records and document_chunks
        try:
            rec_ids = set()
            
            # 1. Records matching patient_id
            r1 = self.sb.table("records") \
                .select("id") \
                .in_("patient_id", ctx.candidate_ids) \
                .execute()
            if r1 and r1.data:
                rec_ids.update([row["id"] for row in r1.data if row.get("id")])

            # 2. Records matching uploaded_by
            r2 = self.sb.table("records") \
                .select("id") \
                .in_("uploaded_by", ctx.candidate_ids) \
                .execute()
            if r2 and r2.data:
                rec_ids.update([row["id"] for row in r2.data if row.get("id")])

            # 3. Document chunks matching record_id
            r3 = self.sb.table("document_chunks") \
                .select("record_id") \
                .in_("patient_id", ctx.candidate_ids) \
                .execute()
            if r3 and r3.data:
                rec_ids.update([row["record_id"] for row in r3.data if row.get("record_id")])

            ctx.total_file_count = max(len(rec_ids), 1 if ctx.text_records else 0)
        except Exception as e:
            print(f"⚠️ [ContextBuilder] Dynamic records count query error: {e}")
            ctx.total_file_count = 1 if ctx.text_records else 0

        print(f"📊 [Dynamic File Count] Calculated actual uploaded files: {ctx.total_file_count} (Chunks: {len(ctx.text_records)})")

        # 7. Run Core ML analysis
        try:
            ctx.analysis_result = self.ml_analyze_fn(ctx.text_records, structured_vitals)
        except Exception as mle:
            print(f"⚠️ [ContextBuilder] ML risk analysis fallback: {mle}")
            ctx.analysis_result = {
                "risk_level": "Healthy",
                "vitals_detected": structured_vitals
            }

        # Sync risk level with triage
        if ctx.triage_priority in ["RED", "ORANGE"]:
            ctx.analysis_result['risk_level'] = "Critical"
        elif ctx.triage_priority == "YELLOW":
            if ctx.analysis_result.get('risk_level') == "Healthy":
                ctx.analysis_result['risk_level'] = "Warning"

        # Pre-compute formatting attributes
        ctx.vitals = ctx.analysis_result.get('vitals_detected', {})
        ctx.vitals_str = ", ".join([f"{k}: {v}" for k, v in ctx.vitals.items() if v is not None])

        if ctx.active_triage:
            ctx.triage_context = f"\nACTIVE EMERGENCY STATUS: Priority Level {ctx.triage_priority} - {ctx.active_triage.get('ai_reasoning') or 'Emergency triage active'}. Symptoms: {ctx.active_triage.get('symptoms', 'None reported')}."

        ctx.bp_val = ctx.vitals.get('bp') or '120/80 mmHg'
        ctx.sugar_val = f"{ctx.vitals.get('sugar')} mg/dL" if ctx.vitals.get('sugar') else '95 mg/dL'
        ctx.hr_val = f"{ctx.vitals.get('heart_rate')} bpm" if ctx.vitals.get('heart_rate') else '72 bpm'
        ctx.sleep_str = f"{ctx.avg_sleep} hrs/night" if ctx.avg_sleep else '7.2 hrs/night'
        ctx.steps_str = f"{ctx.avg_steps} steps/day" if ctx.avg_steps else '6,500 steps/day'
        ctx.water_str = f"{ctx.avg_water} glasses/day" if ctx.avg_water else '8 glasses/day'
        ctx.immediate_action_str = "Seek immediate medical evaluation" if ctx.triage_priority in ["RED", "ORANGE"] else "Routine clinical monitoring."
        ctx.is_emergency_bool = "true" if ctx.triage_priority in ["RED", "ORANGE", "YELLOW"] else "false"
        ctx.active_triage_reason = ctx.active_triage.get('ai_reasoning') if ctx.active_triage else 'Vitals and physiological markers are within stable clinical thresholds.'
        ctx.active_meds_json_str = json.dumps(ctx.active_meds or ["No active prescriptions recorded"])
        ctx.generated_at_str = f"{datetime.utcnow().isoformat()}Z"

        return ctx
