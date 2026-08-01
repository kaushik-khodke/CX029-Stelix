from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import os
import json
from datetime import datetime, timedelta, timezone
from whatsapp_service import send_whatsapp_assignment

router = APIRouter(prefix="/resource", tags=["Resource Load Balancer"])

def _get_sb():
    try:
        from supabase import create_client
        url = os.getenv("VITE_SUPABASE_URL")
        key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        if not url or not key:
            raise ValueError("Supabase URL or Key missing from environment")
        return create_client(url, key)
    except Exception as e:
        print(f"❌ Failed to create Supabase client: {e}")
        raise HTTPException(status_code=500, detail="Database connection error.")

SEASONAL_PATTERNS = {
    "SUMMER": {
        "months": [3, 4, 5],
        "multiplier": 1.05,
        "conditions": ["dehydration", "heat stroke"]
    },
    "MONSOON": {
        "months": [6, 7, 8, 9],
        "multiplier": 1.15,
        "conditions": ["dengue", "malaria", "viral fever", "respiratory infection"]
    },
    "WINTER": {
        "months": [10, 11, 12, 1, 2],
        "multiplier": 1.10,
        "conditions": ["flu", "asthma", "bronchitis"]
    }
}

def get_seasonal_adjustment():
    current_month = datetime.now().month
    for season, config in SEASONAL_PATTERNS.items():
        if current_month in config["months"]:
            return {
                "season": season,
                "multiplier": config["multiplier"],
                "conditions": config["conditions"]
            }

    return {
        "season": "UNKNOWN",
        "multiplier": 1.0,
        "conditions": []
    }


RISK_CATEGORIES = {
    "CARDIOVASCULAR": {
        "keywords": [
            "hypertension", "heart failure", "cardiac arrest", "arrhythmia",
            "angina", "myocardial infarction", "atrial fibrillation",
            "coronary artery", "aortic stenosis", "pacemaker",
            "blood pressure", "antihypertensive", "beta blocker",
            "amlodipine", "atorvastatin", "lisinopril", "warfarin",
            "aspirin 75mg", "clopidogrel", "nitroglycerin"
        ],
        "base_risk_weight": 2.5,
        "typical_visit_frequency": 0.8
    },
    "RESPIRATORY": {
        "keywords": [
            "asthma", "COPD", "chronic obstructive", "emphysema",
            "pulmonary fibrosis", "bronchitis", "pneumonia",
            "oxygen therapy", "nebuliser", "inhaler", "salbutamol",
            "budesonide", "tiotropium", "montelukast", "prednisolone",
            "respiratory failure", "SpO2", "oxygen saturation"
        ],
        "base_risk_weight": 2.0,
        "typical_visit_frequency": 0.6
    },
    "DIABETES_METABOLIC": {
        "keywords": [
            "diabetes", "diabetic", "hyperglycemia", "hypoglycemia",
            "insulin", "metformin", "glipizide", "HbA1c", "blood glucose",
            "diabetic neuropathy", "diabetic nephropathy", "retinopathy",
            "ketoacidosis", "DKA", "type 1", "type 2", "glucometer"
        ],
        "base_risk_weight": 1.8,
        "typical_visit_frequency": 0.5
    },
    "NEUROLOGICAL": {
        "keywords": [
            "epilepsy", "seizure", "stroke", "TIA", "transient ischemic",
            "Parkinson", "multiple sclerosis", "dementia", "Alzheimer",
            "migraine", "neuropathy", "phenytoin", "levetiracetam",
            "carbamazepine", "valproate", "clopidogrel", "rivaroxaban",
            "anticoagulant", "warfarin", "brain"
        ],
        "base_risk_weight": 2.2,
        "typical_visit_frequency": 0.4
    },
    "RENAL": {
        "keywords": [
            "renal failure", "kidney disease", "CKD", "chronic kidney",
            "dialysis", "hemodialysis", "creatinine", "GFR", "nephritis",
            "nephrotic", "furosemide", "spironolactone", "bicarbonate",
            "electrolyte", "potassium", "sodium imbalance", "uremia"
        ],
        "base_risk_weight": 2.3,
        "typical_visit_frequency": 0.7
    },
    "ONCOLOGY": {
        "keywords": [
            "cancer", "carcinoma", "tumor", "chemotherapy", "radiotherapy",
            "lymphoma", "leukemia", "metastasis", "oncology", "biopsy",
            "neutropenia", "immunocompromised", "palliative", "morphine",
            "fentanyl", "dexamethasone", "ondansetron", "antiemetic"
        ],
        "base_risk_weight": 3.0,
        "typical_visit_frequency": 1.2
    },
    "MENTAL_HEALTH": {
        "keywords": [
            "schizophrenia", "bipolar", "depression", "anxiety disorder",
            "psychosis", "suicidal", "self-harm", "OD", "overdose",
            "haloperidol", "olanzapine", "risperidone", "lithium",
            "sertraline", "fluoxetine", "diazepam", "lorazepam"
        ],
        "base_risk_weight": 1.5,
        "typical_visit_frequency": 0.3
    },
    "SURGICAL_RECOVERY": {
        "keywords": [
            "post-op", "post operative", "surgical wound", "sutures",
            "drain", "colostomy", "stoma", "anastomosis", "revision",
            "wound infection", "dehiscence", "haematoma", "abscess",
            "antibiotics", "amoxicillin", "flucloxacillin", "wound care"
        ],
        "base_risk_weight": 1.6,
        "typical_visit_frequency": 0.4
    }
}

def compute_prescription_risk_profile(hospital_id: str) -> dict:
    from collections import defaultdict
    sb = _get_sb()

    triage_rows = sb.table("triage_queue").select("patient_id").eq("hospital_id", hospital_id).not_.is_("patient_id", "null").execute().data
    known_patient_ids = list({r["patient_id"] for r in triage_rows if r.get("patient_id")})

    if not known_patient_ids:
        return {
            "risk_score": 0.5,
            "high_risk_patient_count": 0,
            "total_patients_analysed": 0,
            "category_breakdown": {},
            "predicted_monthly_visits_from_chronic": 0,
            "complex_patients": 0
        }

    all_chunks = []
    batch_size = 50
    for i in range(0, len(known_patient_ids), batch_size):
        batch = known_patient_ids[i:i+batch_size]
        result = sb.table("document_chunks").select("patient_id, content").in_("patient_id", batch).execute()
        all_chunks.extend(result.data or [])

    if not all_chunks:
        return {
            "risk_score": 0.5,
            "high_risk_patient_count": 0,
            "total_patients_analysed": len(known_patient_ids),
            "category_breakdown": {},
            "predicted_monthly_visits_from_chronic": 0,
            "complex_patients": 0
        }

    patient_categories = defaultdict(set)
    for chunk in all_chunks:
        pid = chunk.get("patient_id")
        text = (chunk.get("content") or "").lower()
        for category, config in RISK_CATEGORIES.items():
            if any(kw.lower() in text for kw in config["keywords"]):
                patient_categories[pid].add(category)

    category_patient_counts = defaultdict(int)
    total_weighted_risk = 0.0
    predicted_monthly_visits = 0.0
    high_risk_patients = set()
    HIGH_RISK_THRESHOLD = 2.0

    for pid, categories in patient_categories.items():
        patient_risk = 0.0
        for cat in categories:
            config = RISK_CATEGORIES[cat]
            category_patient_counts[cat] += 1
            patient_risk += config["base_risk_weight"]
            predicted_monthly_visits += config["typical_visit_frequency"]

        total_weighted_risk += patient_risk
        if patient_risk >= HIGH_RISK_THRESHOLD:
            high_risk_patients.add(pid)

    total_analysed = len(known_patient_ids)
    high_risk_count = len(high_risk_patients)

    if total_analysed > 0:
        risk_ratio = high_risk_count / total_analysed
        risk_score = min(risk_ratio * 4.0, 3.0)
    else:
        risk_score = 0.5

    complex_patients = sum(1 for cats in patient_categories.values() if len(cats) >= 3)
    if complex_patients > 0 and total_analysed > 0:
        complexity_bonus = min((complex_patients / total_analysed) * 2.0, 1.0)
        risk_score += complexity_bonus

    return {
        "risk_score": round(min(risk_score, 4.0), 2),
        "high_risk_patient_count": high_risk_count,
        "total_patients_analysed": total_analysed,
        "predicted_monthly_visits_from_chronic": round(predicted_monthly_visits, 1),
        "complex_patients": complex_patients,
        "category_breakdown": {
            cat: {
                "patient_count": category_patient_counts[cat],
                "visit_frequency": RISK_CATEGORIES[cat]["typical_visit_frequency"],
                "risk_weight": RISK_CATEGORIES[cat]["base_risk_weight"]
            }
            for cat in category_patient_counts
        }
    }

def compute_time_signal(hospital_id: str, horizon_hours: int) -> float:
    sb = _get_sb()
    now = datetime.now(timezone.utc)
    target_dt = now + timedelta(hours=horizon_hours)
    target_hour = target_dt.hour
    day_of_week = target_dt.weekday()
    
    four_weeks_ago = now - timedelta(days=28)
    res = sb.table("triage_queue").select("arrival_time").eq("hospital_id", hospital_id).gte("arrival_time", four_weeks_ago.isoformat()).execute()
    
    weeks_arrivals = [0, 0, 0, 0] 
    for row in res.data or []:
        try:
            arr_time_str = row["arrival_time"]
            if arr_time_str.endswith("Z"):
                arr_time_str = arr_time_str.replace("Z", "+00:00")
            dt = datetime.fromisoformat(arr_time_str)
            if dt.weekday() == day_of_week and dt.hour == target_hour:
                days_ago = (now - dt).days
                week_idx = 3 - (days_ago // 7)
                if 0 <= week_idx < 4:
                    weeks_arrivals[week_idx] += 1
        except Exception:
            pass
                
    weights = [0.1, 0.2, 0.3, 0.4]
    weighted_avg = sum([weeks_arrivals[i] * weights[i] for i in range(4)])
    return weighted_avg

def compute_resource_multiplier(hospital_id: str) -> float:
    sb = _get_sb()
    beds_res = sb.table("hospital_beds").select("status").eq("hospital_id", hospital_id).execute()
    beds = beds_res.data or []
    total_beds = len(beds)
    if total_beds == 0: return 1.0
    occupied_beds = len([b for b in beds if b["status"] == "occupied"])
    occupancy_rate = occupied_beds / total_beds
    # E.g. 50% mult=1.0, 85% mult=1.25, 100% mult=1.4
    if occupancy_rate > 0.8:
        return 1.25
    elif occupancy_rate > 0.6:
        return 1.1
    return 1.0

def forecast_inflow(hospital_id: str, horizon_hours: int) -> dict:
    time_signal    = compute_time_signal(hospital_id, horizon_hours)
    resource_mult  = compute_resource_multiplier(hospital_id)
    risk_profile   = compute_prescription_risk_profile(hospital_id)

    historical_adj = risk_profile["risk_score"]
    chronic_visit_rate = risk_profile["predicted_monthly_visits_from_chronic"]
    chronic_contribution = (chronic_visit_rate / 30 / 24) * horizon_hours

    seasonal = get_seasonal_adjustment()
    seasonal_mult = seasonal["multiplier"]

    raw = (time_signal * 0.7) + historical_adj + chronic_contribution
    adjusted = raw * resource_mult * seasonal_mult

    prediction = max(1, round(adjusted))

    return {
        "prediction": prediction,
        "breakdown": {
            "time_pattern":           round(time_signal, 1),
            "resource_pressure_mult": round(resource_mult, 2),
            "prescription_risk_adj":  round(historical_adj, 2),
            "chronic_contribution":   round(chronic_contribution, 1),
            "season":                 seasonal["season"],
            "seasonal_multiplier":    seasonal_mult,
            "seasonal_conditions":    seasonal["conditions"],
            "high_risk_patients":     risk_profile["high_risk_patient_count"],
            "complex_patients":       risk_profile["complex_patients"],
            "total_analysed":         risk_profile["total_patients_analysed"],
            "top_risk_categories":    sorted(
                risk_profile["category_breakdown"].items(),
                key=lambda x: x[1]["patient_count"],
                reverse=True
            )[:3],
            "method": "4-signal: time + resource + prescription + seasonal"
        }
    }


@router.get("/snapshot/{hospital_id}")
async def get_snapshot(hospital_id: str):
    sb = _get_sb()
    # Queue counts
    triage_res = sb.table("triage_queue").select("status, priority_level").eq("hospital_id", hospital_id).in_("status", ["waiting", "in_treatment"]).execute()
    patients = triage_res.data or []
    waiting_patients = len([p for p in patients if p["status"] == "waiting"])
    red_count = len([p for p in patients if p["priority_level"] == "RED"])
    orange_count = len([p for p in patients if p["priority_level"] == "ORANGE"])
    
    # Bed counts
    beds_res = sb.table("hospital_beds").select("status").eq("hospital_id", hospital_id).execute()
    beds = beds_res.data or []
    total_beds = len(beds)
    occupied_beds = len([b for b in beds if b["status"] == "occupied"])
    
    # Compute load_score safely
    if total_beds == 0:
        total_beds = 1
        occupied_beds = 0
        
    load_score = (occupied_beds / total_beds * 0.5) + (waiting_patients / 20 * 0.3) + (red_count * 0.1 + orange_count * 0.05) * 0.2
    
    if load_score < 0.4: load_index = 'LOW'
    elif load_score < 0.65: load_index = 'MODERATE'
    elif load_score < 0.85: load_index = 'PEAK'
    else: load_index = 'CRITICAL'
    
    forecast_1h_result = forecast_inflow(hospital_id, 1)
    forecast_4h_result = forecast_inflow(hospital_id, 4)
    
    forecast_1h = forecast_1h_result["prediction"]
    forecast_4h = forecast_4h_result["prediction"]
    forecast_breakdown = forecast_1h_result["breakdown"]
    
    snapshot_data = {
        "hospital_id": hospital_id,
        "total_beds": total_beds,
        "occupied_beds": occupied_beds,
        "waiting_patients": waiting_patients,
        "red_count": red_count,
        "orange_count": orange_count,
        "load_index": load_index,
        "load_score": load_score,
        "forecast_1h": forecast_1h,
        "forecast_4h": forecast_4h,
        "forecast_breakdown": forecast_breakdown
    }
    
    # Insert to DB — try with breakdown first, fallback without if column missing
    try:
        sb.table("load_snapshots").insert(snapshot_data).execute()
    except Exception:
        db_data = {k: v for k, v in snapshot_data.items() if k != "forecast_breakdown"}
        try:
            sb.table("load_snapshots").insert(db_data).execute()
        except Exception as e:
            print(f"⚠️ Could not save snapshot: {e}")
    
    return snapshot_data

@router.get("/beds/{hospital_id}")
async def get_beds(hospital_id: str):
    sb = _get_sb()
    beds_res = sb.table("hospital_beds").select("*").eq("hospital_id", hospital_id).execute()
    beds = beds_res.data or []
    if not beds:
        # Fallback for demo: if no beds for this user, return all beds
        beds_res = sb.table("hospital_beds").select("*").execute()
        beds = beds_res.data or []
    return beds

class BedUpdateRequest(BaseModel):
    status: Optional[str] = None
    patient_id: Optional[str] = None
    triage_id: Optional[str] = None
    priority_assigned: Optional[str] = None
    est_discharge: Optional[str] = None

class BedTransferRequest(BaseModel):
    source_bed_id: str
    target_bed_id: str

@router.patch("/beds/{bed_id}")
async def update_bed(bed_id: str, data: BedUpdateRequest):
    sb = _get_sb()
    update_data = data.dict(exclude_unset=True)
    
    if update_data.get("priority_assigned"):
        prio = update_data["priority_assigned"]
        now = datetime.now(timezone.utc)
        if prio == "RED": offset = 6
        elif prio == "ORANGE": offset = 12
        elif prio == "YELLOW": offset = 24
        else: offset = 4
        update_data["est_discharge"] = (now + timedelta(hours=offset)).isoformat()
        if not update_data.get("admitted_at"):
            update_data["admitted_at"] = now.isoformat()
            
    res = sb.table("hospital_beds").update(update_data).eq("id", bed_id).execute()
    return res.data

@router.get("/doctors")
async def get_doctors():
    sb = _get_sb()
    
    # 1. Run opportunistic timeout check (Fail-safe)
    try:
        five_mins_ago = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
        sb.table("doctor_assignments").update({"status": "no_response"})\
            .eq("status", "pending")\
            .lt("created_at", five_mins_ago)\
            .execute()
    except Exception as te:
        print(f"⚠️ Timeout check failed: {te}")

    # 2. Fetch doctors enriched with latest_assignment status
    # We join with the latest_doctor_assignments view
    res = sb.table("doctors").select("*, latest_doctor_assignments(status, created_at, ward, shift)").execute()
    
    # Clean up the join structure for the frontend
    doctors = res.data or []
    for doc in doctors:
        latest = doc.pop("latest_doctor_assignments", [])
        doc["latest_assignment"] = latest[0] if latest else None
        
    return doctors

class DoctorUpdateRequest(BaseModel):
    shift_type: Optional[str] = None
    ward_assigned: Optional[str] = None

@router.patch("/doctors/{doc_id}")
async def update_doctor(doc_id: str, data: DoctorUpdateRequest, background_tasks: BackgroundTasks):
    sb = _get_sb()
    update_dict = data.dict(exclude_unset=True)
    
    # 1. Fetch current state to check if ward/shift actually changed
    current_res = sb.table("doctors").select("ward_assigned, shift_type, name, user_id").eq("id", doc_id).single().execute()
    if not current_res.data:
        raise HTTPException(status_code=404, detail="Doctor not found")
    
    current = current_res.data
    ward_changed = "ward_assigned" in update_dict and update_dict["ward_assigned"] != current["ward_assigned"]
    shift_changed = "shift_type" in update_dict and update_dict["shift_type"] != current["shift_type"]
    
    # 2. Update the main doctors table
    res = sb.table("doctors").update(update_dict).eq("id", doc_id).execute()
    
    # 3. If ward or shift changed, trigger WhatsApp confirmation flow
    if ward_changed or shift_changed:
        new_ward = update_dict.get("ward_assigned", current["ward_assigned"])
        new_shift = update_dict.get("shift_type", current["shift_type"])
        
        # 3a. Record new pending assignment
        assign_res = sb.table("doctor_assignments").insert({
            "doctor_id": doc_id,
            "ward": new_ward,
            "shift": new_shift,
            "status": "pending"
        }).execute()
        
        if assign_res.data:
            assignment_id = assign_res.data[0]["id"]
            
            # 3b. Fetch phone number from profiles
            # doctors.user_id -> profiles.id
            profile_res = sb.table("profiles").select("phone").eq("id", current["user_id"]).execute()
            phone = profile_res.data[0].get("phone") if (profile_res and profile_res.data) else None
            target_phone = phone if (phone and str(phone).strip()) else "9022434807"
            
            # 3c. Async trigger for WhatsApp shift alert
            background_tasks.add_task(
                send_whatsapp_assignment,
                phone=target_phone,
                doctor_name=current["name"],
                ward=new_ward,
                shift=new_shift,
                assignment_id=assignment_id
            )

    return res.data

@router.post("/analyze/{hospital_id}")
async def analyze_resources(hospital_id: str):
    sb = _get_sb()
    from collections import Counter
    
    # 1. Beds (Existing logic without hospital_staff)
    all_beds_res = sb.table("hospital_beds").select("*").eq("hospital_id", hospital_id).execute()
    all_beds = all_beds_res.data or []
    total_beds = len(all_beds)
    occupied_count = len([b for b in all_beds if b["status"] == "occupied"])
    bed_counts = Counter([f"{b['ward_type']}_{b['status']}" for b in all_beds])
    
    # 2. Doctors (Replaces old staff table)
    staff_res = sb.table("doctors").select("specialization, shift_type").execute()
    staff = staff_res.data or []
    staff_counts = Counter([f"doctor_{s.get('shift_type', 'Morning Shift')}" for s in staff])

    
    # 2. Pharmacy (Existing)
    pharmacy_res = sb.table("medicines").select("drug_name, quantity, low_stock_threshold").eq("hospital_id", hospital_id).execute()
    pharmacy = pharmacy_res.data or []
    low_stock_meds = [m for m in pharmacy if m["quantity"] <= (m["low_stock_threshold"] or 10)]
    
    # 3. Medical Equipment (NEW)
    equip_res = sb.table("medical_equipment").select("name, type, status").eq("hospital_id", hospital_id).execute()
    equipment = equip_res.data or []
    equip_counts = Counter([f"{e['type']}_{e['status']}" for e in equipment])
    
    # 4. Ambulances (NEW)
    amb_res = sb.table("ambulance_fleet").select("vehicle_number, type, status").eq("hospital_id", hospital_id).execute()
    ambulances = amb_res.data or []
    amb_counts = Counter([f"{a['type']}_{a['status']}" for a in ambulances])
    
    # 5. Blood Bank (NEW)
    blood_res = sb.table("blood_bank").select("blood_type, units_available, low_threshold").eq("hospital_id", hospital_id).execute()
    blood = blood_res.data or []
    low_blood = [b for b in blood if b["units_available"] <= b["low_threshold"]]
    
    # 6. Lab Supplies (NEW)
    lab_res = sb.table("lab_supplies").select("item_name, quantity, unit").eq("hospital_id", hospital_id).execute()
    lab = lab_res.data or []
    
    # Triage Queue (Existing)
    queue_res = sb.table("triage_queue").select("priority_level, arrival_time").eq("hospital_id", hospital_id).eq("status", "waiting").execute()
    queue = queue_res.data or []
    priority_order = {"RED": 1, "ORANGE": 2, "YELLOW": 3, "GREEN": 4, "BLUE": 5}
    queue.sort(key=lambda x: (priority_order.get(x["priority_level"], 6), x["arrival_time"]))
    top_queue = [p["priority_level"] for p in queue[:5]]
    
    # Snapshot/Trends
    snap_res = sb.table("load_snapshots").select("*").eq("hospital_id", hospital_id).order("snapshot_at", desc=True).limit(1).execute()
    snap = snap_res.data
    latest_snap = snap[0] if snap else {}

    system_prompt = f'''You are the "MyHealthChain Command Center AI".
Your task is to provide a "Comprehensive Strategic Operations Report" for hospital administration.
You must analyze the relationship between clinical load, staff availability, and critical supplies.

Strategic Logic Rules:
- If high priority (RED/ORANGE) patients are waiting and beds are low, flag CRITICAL BED SHORTAGE.
- If blood types are below threshold, flag CLINICAL RISK.
- If medical equipment (like Ventilators) is in use during a respiratory surge, suggest procurement or maintenance shifts.
- Consider ambulance availability for potential patient transfers/ER inflow.
- Be concise but clinically authoritative.

Respond in this structured JSON format:
{{
  "summary": "High-level executive overview (2 sentences)",
  "sections": [
    {{
      "title": "Clinical & Capacity",
      "status": "CRITICAL"|"WARNING"|"STABLE",
      "details": "Assessment of beds, staff and patient queue"
    }},
    {{
      "title": "Pharmacy & Lab",
      "status": "CRITICAL"|"WARNING"|"STABLE",
      "details": "Assessment of medications and lab inventory"
    }},
    {{
      "title": "Logistics & Equipment",
      "status": "CRITICAL"|"WARNING"|"STABLE",
      "details": "Assessment of ambulances and medical equipment"
    }}
  ],
  "strategic_actions": [
    {{ "priority": "URGENT"|"ROUTINE", "title": "Headline", "instruction": "Actionable step" }}
  ],
  "alert_needed": true|false,
  "alert_type": "CAPACITY_WARNING"|"SUPPLY_CRITICAL"|"SYSTEM_OVERLOAD"|null
}}'''

    user_prompt = f"""
    Current Counts:
    - Beds: {json.dumps(dict(bed_counts))}
    - Staff: {json.dumps(dict(staff_counts))}
    - Waiting Patients: {json.dumps(top_queue)}
    - Equipment: {json.dumps(dict(equip_counts))}
    - Ambulances: {json.dumps(dict(amb_counts))}
    - Low Stock Meds: {json.dumps(low_stock_meds)}
    - Low Blood Types: {json.dumps(low_blood)}
    - Key Lab Supplies: {json.dumps(lab[:5])}
    - Forecast: +{latest_snap.get("forecast_1h", 0)} in 1h
    """

    try:
        from google.genai import types
        from ai_config import safe_generate_content
        
        response = asyncio.run(safe_generate_content(
            contents=[system_prompt, user_prompt],
            task_type="text_fast",
            config=types.GenerateContentConfig(response_mime_type="application/json")
        ))
        
        parsed = json.loads(response.text.strip())
        
        if parsed.get("alert_needed") and parsed.get("alert_type"):
            sb.table("resource_alerts").insert({
                "hospital_id": hospital_id,
                "alert_type": parsed["alert_type"],
                "message": parsed.get("summary", "Resource stress detected"),
                "severity": "CRITICAL" if "CRITICAL" in response.text else "WARNING",
                "ai_recommendation": " | ".join([a["instruction"] for a in parsed.get("strategic_actions", [])]),
                "metadata": parsed
            }).execute()
            
        return parsed
        
    except Exception as e:
        print("Analyze Error:", e)
        raise HTTPException(status_code=500, detail=str(e))
        
    except Exception as e:
        print("Analyze Error:", e)
        raise HTTPException(status_code=500, detail=str(e))

# ==========================================
# PHARMACY EXTENSION (Reusing Medicines Table)
# ==========================================

class PharmacyDispenseRequest(BaseModel):
    medicine_id: str
    quantity_dispensed: int
    triage_id: Optional[str] = None

class PharmacyPatchRequest(BaseModel):
    in_stock: int

class BedCreateRequest(BaseModel):
    hospital_id: str
    ward_type: str
    bed_number: str

@router.get("/pharmacy/{hospital_id}")
async def get_pharmacy_stock(hospital_id: str):
    sb = _get_sb()
    # medicines table has no hospital_id — it's a shared inventory
    res = sb.table("medicines").select("*").order("name").execute()
    meds = res.data or []
        
    for m in meds:
        m['drug_name'] = m.get('name', '')
        m['quantity'] = m.get('stock', 0)
        m['unit'] = m.get('package_size') or m.get('unit_type') or ''
        m['strength'] = m.get('strength') or ''
        m['requires_prescription'] = m.get('prescription_required', False)
        
        low = m.get('reorder_threshold') or 20
        crit = max(1, (m.get('reorder_threshold') or 20) // 4)
        qty = m['quantity']
        if qty <= crit:
            m['stock_status'] = 'CRITICAL'
        elif qty <= low:
            m['stock_status'] = 'LOW'
        else:
            m['stock_status'] = 'NORMAL'

    grouped = {}
    for m in meds:
        cat = m.get('category') or 'GENERAL'
        if cat not in grouped:
            grouped[cat] = []
        grouped[cat].append(m)
        
    return [{"category": k, "items": v} for k, v in grouped.items()]

@router.delete("/pharmacy/{medicine_id}")
async def delete_medicine_endpoint(medicine_id: str):
    sb = _get_sb()
    res = sb.table("medicines").delete().eq("id", medicine_id).execute()
    return {"status": "success"}

@router.post("/beds")
async def add_bed(req: BedCreateRequest):
    sb = _get_sb()
    res = sb.table("hospital_beds").insert({
        "hospital_id": req.hospital_id,
        "ward_type": req.ward_type,
        "bed_number": req.bed_number,
        "status": "available"
    }).execute()
    return res.data[0] if res.data else {}

@router.delete("/beds/{bed_id}")
async def remove_bed(bed_id: str):
    sb = _get_sb()
    res = sb.table("hospital_beds").delete().eq("id", bed_id).execute()
    return {"status": "success"}

@router.post("/beds/{bed_id}/discharge")
async def discharge_bed(bed_id: str):
    sb = _get_sb()
    # 1. Get bed info to find triage_id
    bed_res = sb.table("hospital_beds").select("triage_id").eq("id", bed_id).single().execute()
    if not bed_res.data:
        raise HTTPException(status_code=404, detail="Bed not found")
    
    tid = bed_res.data.get("triage_id")
    
    # 2. Update bed to available
    sb.table("hospital_beds").update({
        "status": "available",
        "triage_id": None,
        "patient_id": None,
        "priority_assigned": None
    }).eq("id", bed_id).execute()
    
    # 3. Update triage queue status
    if tid:
        sb.table("triage_queue").update({"status": "discharged"}).eq("id", tid).execute()
    
    return {"status": "success"}

@router.post("/beds/transfer")
async def transfer_patient(req: BedTransferRequest):
    sb = _get_sb()
    
    # 1. Fetch source bed info
    source_res = sb.table("hospital_beds").select("*").eq("id", req.source_bed_id).single().execute()
    if not source_res.data:
        raise HTTPException(status_code=404, detail="Source bed not found")
    source_bed = source_res.data
    
    if source_bed["status"] != "occupied":
        raise HTTPException(status_code=400, detail="Source bed is not occupied")
        
    # 2. Fetch target bed info
    target_res = sb.table("hospital_beds").select("*").eq("id", req.target_bed_id).single().execute()
    if not target_res.data:
        raise HTTPException(status_code=404, detail="Target bed not found")
    target_bed = target_res.data
    
    if target_bed["status"] != "available":
        raise HTTPException(status_code=400, detail="Target bed is not available")
        
    # 3. Perform transfer (Atomic update if possible, but here we do sequential)
    # Target gets source's patient data
    sb.table("hospital_beds").update({
        "status": "occupied",
        "patient_id": source_bed["patient_id"],
        "triage_id": source_bed["triage_id"],
        "priority_assigned": source_bed["priority_assigned"],
        "admitted_at": source_bed["admitted_at"],
        "est_discharge": source_bed["est_discharge"]
    }).eq("id", req.target_bed_id).execute()
    
    # Source becomes available
    sb.table("hospital_beds").update({
        "status": "available",
        "patient_id": None,
        "triage_id": None,
        "priority_assigned": None,
        "admitted_at": None,
        "est_discharge": None
    }).eq("id", req.source_bed_id).execute()
    
    return {"status": "success"}

@router.post("/beds/reset/{hospital_id}")
async def reset_beds(hospital_id: str):
    sb = _get_sb()
    # 1. Clear existing
    sb.table("hospital_beds").delete().eq("hospital_id", hospital_id).execute()
    
    # 2. Define counts
    counts = {
        'ICU': 5,
        'EMERGENCY': 13,
        'OBSERVATION': 22,
        'GENERAL': 28
    }
    
    # 3. Batch insert
    to_insert = []
    for ward, count in counts.items():
        prefix = ward[:3].upper() if ward != 'EMERGENCY' else 'EMG'
        for i in range(1, count + 1):
            to_insert.append({
                "hospital_id": hospital_id,
                "ward_type": ward,
                "bed_number": f"{prefix}-{i:02d}",
                "status": "available"
            })
            
    # Supabase insert in chunks of 50 to avoid limits
    for i in range(0, len(to_insert), 50):
        sb.table("hospital_beds").insert(to_insert[i:i+50]).execute()
        
    return {"status": "success", "count": len(to_insert)}

@router.patch("/pharmacy/{medicine_id}")
async def update_pharmacy_stock(medicine_id: str, req: PharmacyPatchRequest):
    sb = _get_sb()
    res = sb.table("medicines").update({"stock": req.in_stock}).eq("id", medicine_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Medicine not found")
        
    med = res.data[0]
    _check_pharmacy_alert(sb, med)
    return med

@router.post("/pharmacy/dispense/{hospital_id}")
async def dispense_pharmacy(hospital_id: str, req: PharmacyDispenseRequest):
    sb = _get_sb()
    
    # 1. Get current stock
    med_res = sb.table("medicines").select("*").eq("id", req.medicine_id).execute()
    if not med_res.data:
        raise HTTPException(status_code=404, detail="Medicine not found")
    med = med_res.data[0]
    
    current_qty = med.get("stock") if med.get("stock") is not None else med.get("in_stock", 0)
    new_qty = max(0, current_qty - req.quantity_dispensed)
    
    # 2. Update stock
    up_res = sb.table("medicines").update({"stock": new_qty}).eq("id", req.medicine_id).execute()
    updated_med = up_res.data[0]
    
    _check_pharmacy_alert(sb, updated_med, hospital_id)
    return updated_med

def _check_pharmacy_alert(sb, med, req_h_id=None):
    qty = med.get("stock") if med.get("stock") is not None else med.get("in_stock", 0)
    crit = med.get("critical_threshold") or 5
    hospital_id = med.get("hospital_id") or req_h_id
    if qty <= crit:
        # Create alert
        sb.table("resource_alerts").insert({
            "hospital_id": hospital_id,
            "alert_type": "CAPACITY_WARNING",
            "message": f"Critical low stock for {med.get('name') or med.get('medicine_name', 'Unknown')}: {qty} remaining.",
            "severity": "CRITICAL",
            "ai_recommendation": f"Immediately restock {med.get('name') or med.get('medicine_name')}"
        }).execute()

