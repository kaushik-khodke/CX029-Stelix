from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import os
import io
import time
import json
import asyncio
from dotenv import load_dotenv

# ── Load .env FIRST before anything else reads env vars ──────────────────────
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'), override=True)
load_dotenv(os.path.join(os.path.dirname(__file__), '.env'), override=True)  # also load local backend/.env if present

import stripe
import sys
stripe.api_key = os.getenv("STRIPE_SECRET_KEY")
print(f"--- RENDER STARTUP DIAGNOSTICS ---")
print(f"Python version: {sys.version}")
print(f"Current Directory: {os.getcwd()}")
print(f"Stripe key loaded: {'YES' if stripe.api_key and stripe.api_key.startswith('sk_') else 'NO - MISSING!'}")
print(f"----------------------------------")

from google import genai
from google.genai import types

from voice_service import VoiceService
from rag_service import RAGService
from pharmacy_service import PharmacyService
from ml_engine import analyze_risk, parse_medical_text
from payment_service import _create_stripe_checkout
from outbound_call_service import OutboundCallService
from ml_triage import train_triage_model, predict_priority
from langfuse.decorators import observe
from resource_load import router as resource_router

# Initialize FastAPI
app = FastAPI(title="Healthcare AI Assistant", version="2.0.0")
app.include_router(resource_router)

PORT = int(os.getenv("PORT", 8000))

# CORS Configuration
_raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173,http://localhost:8000,http://127.0.0.1:8000")
_allowed_origins = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"status": "online", "message": "Healthcare AI API is running on port 8000"}

@app.get("/health")
async def health_check():
    return {"status": "ok", "timestamp": time.time()}

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    body = await request.body()
    print(f"❌ Validation Error: {exc.errors()}")
    print(f"📦 Raw Body: {body.decode()}")
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors(), "body": body.decode()},
    )

from ai_config import get_ai_client, safe_generate_content, MODEL_TEXT_FAST, MODEL_TOOL_AGENT

# Initialize Gemini Client
client = get_ai_client()
chat_sessions = {}

try:
    rag_service = RAGService(
        supabase_url=os.getenv("VITE_SUPABASE_URL"),
        supabase_key=os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    )
except Exception as e:
    print(f"⚠️ RAGService initialization failed (Supabase error): {e}")
    rag_service = None

pharmacy_service = PharmacyService()

try:
    outbound_call_service = OutboundCallService()
except Exception as e:
    print(f"⚠️ OutboundCallService initialization failed: {e}")
    outbound_call_service = None

# ==========================================
# Request/Response Models
# ==========================================
class ChatRequest(BaseModel):
    message: str
    language: str = "en"
    user_id: Optional[str] = None
    use_records: bool = False
    use_voice: bool = False  # New: indicates if user used voice input

class ChatResponse(BaseModel):
    success: bool
    response: str
    audio_url: Optional[str] = None
    audio_data: Optional[str] = None  # Base64 encoded audio
    error: Optional[str] = None

class ChatClearRequest(BaseModel):
    user_id: str

class DocumentProcessRequest(BaseModel):
    file_url: str
    record_id: str
    patient_id: str

class HealthAnalysisRequest(BaseModel):
    user_id: str

class SmartInsightsRequest(BaseModel):
    user_id: str

class DailyAgendaRequest(BaseModel):
    user_id: str

class PharmacyChatRequest(BaseModel):
    message: str
    patient_id: str
    language: str = "en"
    use_voice: bool = False

class CheckoutSessionRequest(BaseModel):
    order_id: str
    success_url: str
    cancel_url: str

class VerifyPaymentRequest(BaseModel):
    session_id: str
    order_id: Optional[str] = None

class ManualOrderRequest(BaseModel):
    patient_id: str          # auth.uid()
    items: list              # [{"medicine_id": str, "qty": int}]

class PharmacistAIRequest(BaseModel):
    message: str
    use_voice: bool = False
    language: str = "en"

class VoiceOrderRequest(BaseModel):
    patient_id: str
    medicine_name: str
    quantity: int = 1

class InitiateCallRequest(BaseModel):
    patient_id: str
    phone_number: str = None

class TriageAnalyzeRequest(BaseModel):
    vitals: Dict[str, str]
    symptoms: str
    history: str = ""
    patient_id: Optional[str] = None

class LogDoseRequest(BaseModel):
    user_id: str
    medicine_id: str
    order_item_id: str
    status: str
    scheduled_time: Optional[str] = None

class SetReminderRequest(BaseModel):
    user_id: str
    medicine_id: str
    order_item_id: str
    reminder_time: str
    frequency: int = 1


# ==========================================
# ROUTES
# ==========================================

# ---- Medicine / Order helper (shared Supabase client) ----
from functools import lru_cache

@lru_cache(maxsize=1)
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
        raise HTTPException(status_code=500, detail="Database connection error. Please check API keys.")

def get_patient_db_id(user_id_or_patient_id: str):
    """
    Robustly resolves the internal 'patients.id' from either:
    1. A 'patients.id' (UUID)
    2. A 'patients.user_id' (auth.uid() UUID)
    """
    sb = _get_sb()
    # Strategy 1: check if it's already a patients.id
    res = sb.table("patients").select("id").eq("id", user_id_or_patient_id).maybe_single().execute()
    if res.data:
        return res.data["id"]
    
    # Strategy 2: check if it's a user_id
    res = sb.table("patients").select("id").eq("user_id", user_id_or_patient_id).maybe_single().execute()
    if res.data:
        return res.data["id"]
    
    return None

def get_auth_user_id(db_id: str):
    """Refetch the auth.uid() associated with a patients.id"""
    sb = _get_sb()
    res = sb.table("patients").select("user_id").eq("id", db_id).maybe_single().execute()
    return res.data["user_id"] if res.data else None

@app.get("/my-medicines")
async def get_my_medicines(patient_id: str):
    """
    Returns the patient's active medicine cabinet and order history.
    Includes both standard orders and legacy raw history.
    """
    try:
        if not pharmacy_service:
            raise HTTPException(status_code=503, detail="Pharmacy service not available")
        
        # 1. Fetch aggregated history from PharmacyService
        # Note: PharmacyService.get_patient_orders expects either auth user_id or patient_id
        items = await pharmacy_service.get_patient_orders(patient_id)
        
        if not items:
            return {"success": True, "orders": []}

        # 2. Group by order_id to match frontend's expected Order[] structure
        orders_map = {}
        for it in items:
            oid = it["order_id"]
            if oid not in orders_map:
                orders_map[oid] = {
                    "id": oid,
                    "status": it["status"],
                    "channel": it["channel"],
                    "created_at": it["created_at"],
                    "finalized_at": it.get("finalized_at"),
                    "items": []
                }
            
            # Reconstruct OrderItem structure
            orders_map[oid]["items"].append({
                "id": it["order_item_id"],
                "qty": it["qty"],
                "dosage_text": it.get("dosage_text"),
                "frequency_per_day": it.get("frequency_per_day"),
                "days_supply": it.get("days_supply"),
                "medicines": {
                    "id": it.get("medicine_id"),
                    "name": it.get("medicine_name"),
                    "strength": it.get("strength"),
                    "unit_type": it.get("unit_type"),
                    "price_rec": it.get("price_rec"),
                    "package_size": it.get("package_size")
                }
            })

        # 3. Convert back to list sorted by date
        enriched = list(orders_map.values())
        enriched.sort(key=lambda x: x["created_at"], reverse=True)

        return {"success": True, "orders": enriched}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/available-medicines")
def get_available_medicines(search: str = "", limit: int = 50):
    """Return medicines catalogue with stock > 0, optionally filtered by name."""
    try:
        sb = _get_sb()
        q = sb.table("medicines").select(
            "id,name,strength,unit_type,stock,prescription_required,price_rec,description"
        ).gt("stock", 0).limit(limit)
        if search:
            q = q.ilike("name", f"%{search}%")
        res = q.execute()
        return {"success": True, "medicines": res.data or []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/manual-order")
async def manual_order(request: ManualOrderRequest):
    """
    Create and finalize a manual order for a patient.
    Checks stock availability and prescription requirement.
    Decrements stock via decrement_medicine_stock RPC.
    """
    try:
        sb = _get_sb()
        # Resolve auth uid → patients.id
        pt = sb.table("patients").select("id").eq("user_id", request.patient_id).maybe_single().execute()
        if not pt or not pt.data:
            # Auto-create patient profile if missing
            new_pt = sb.table("patients").insert({
                "user_id": request.patient_id,
                "full_name": "New Patient",
                "phone": "+10000000000"
            }).execute()
            pid = new_pt.data[0]["id"]
        else:
            pid = pt.data["id"]

        errors = []
        valid_items = []

        # Batch fetch medicines
        med_ids = [item.get("medicine_id") for item in request.items]
        meds_res = sb.table("medicines").select("id,name,stock,prescription_required").in_("id", med_ids).execute()
        meds_dict = {m["id"]: m for m in (meds_res.data or [])}

        for item in request.items:
            med_id = item.get("medicine_id")
            qty = max(1, int(item.get("qty", 1)))
            freq = item.get("frequency_per_day")
            dosage = item.get("dosage_text", "As directed")

            m = meds_dict.get(med_id)

            if not m:
                errors.append(f"Medicine {med_id} not found")
                continue

            if m["prescription_required"]:
                from agents.prescription_agent import PrescriptionAgent
                rx_agent = PrescriptionAgent()
                rx_result = await rx_agent.run(m["name"], {
                    "user_id": request.patient_id,
                    "medicine_name": m["name"],
                    "action": "verify"
                })
                
                if not rx_result.success:
                    errors.append(rx_result.message)
                    continue
                
                # If verified, use the extracted info if not provided
                if not freq and rx_result.data.get("frequency_per_day"):
                    freq = rx_result.data.get("frequency_per_day")
                if dosage == "As directed" and rx_result.data.get("amount"):
                    dosage = rx_result.data.get("amount")

            if m["stock"] < qty:
                errors.append(f"Not enough stock for {m['name']} (available: {m['stock']})")
                continue

            valid_items.append({"med": m, "qty": qty, "freq": freq, "dosage": dosage})

        if not valid_items:
            return {"success": False, "error": "; ".join(errors) if errors else "No valid items"}

        # Create order with status 'pending' (valid per CHECK constraint)
        order_res = sb.table("orders").insert({
            "patient_id": pid,
            "status": "pending",
            "total_items": sum(i["qty"] for i in valid_items),
            "channel": "web",
        }).execute()
        order_id = order_res.data[0]["id"]

        # Insert order_items
        if valid_items:
            sb.table("order_items").insert([
                {
                    "order_id": order_id,
                    "medicine_id": i["med"]["id"],
                    "qty": i["qty"],
                    "dosage_text": i["dosage"],
                    "frequency_per_day": i["freq"],
                    "days_supply": 30,
                }
                for i in valid_items
            ]).execute()

        # Decrement stock and mark as fulfilled immediately
        for i in valid_items:
            try:
                sb.rpc("decrement_medicine_stock", {
                    "p_medicine_id": i["med"]["id"],
                    "p_qty": i["qty"],
                }).execute()
            except Exception:
                pass

        from datetime import datetime, timezone
        sb.table("orders").update({
            "status": "fulfilled",
            "finalized_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", order_id).execute()

        return {
            "success": True,
            "order_id": order_id,
            "items_ordered": [{"name": i["med"]["name"], "qty": i["qty"]} for i in valid_items],
            "warnings": errors,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/voice-order")
async def voice_order(request: VoiceOrderRequest):
    """
    Webhook for ElevenLabs Agent to place an order via voice.
    """
    print(f"☎️ Received Voice Order: {request}")
    try:
        sb = _get_sb()
        # 1. Resolve patient auth uid -> patients.id
        pt = sb.table("patients").select("id").eq("user_id", request.patient_id).maybe_single().execute()
        if not pt or not pt.data:
            # Auto-create patient profile if missing
            new_pt = sb.table("patients").insert({
                "user_id": request.patient_id,
                "full_name": "New Patient (Voice)",
                "phone": "+10000000000"
            }).execute()
            patient_db_id = new_pt.data[0]["id"]
        else:
            patient_db_id = pt.data["id"]

        # 2. Search for medicine by name
        search_res = (
            sb.table("medicines")
            .select("id, name, stock, prescription_required, price_rec")
            .ilike("name", f"%{request.medicine_name}%")
            .execute()
        )
        if not search_res.data:
            return {"success": False, "error": f"Medicine '{request.medicine_name}' not found in catalog."}

        med = search_res.data[0]

        # 3. Stock check
        if med["stock"] < request.quantity:
            return {"success": False, "error": f"Only {med['stock']} units of {med['name']} available."}

        # 3.5 Prescription check
        if med["prescription_required"]:
            # Re-use the existing check_rx logic
            recs = (
                sb.table("records")
                .select("extracted_text")
                .eq("patient_id", patient_db_id)
                .eq("record_type", "prescription")
                .execute()
            )
            has_rx = any(
                med["name"].lower() in (r.get("extracted_text") or "").lower()
                for r in (recs.data or [])
            )
            if not has_rx:
                return {
                    "success": False, 
                    "error": f"{med['name']} requires a prescription. Please ask the patient to upload their prescription on the website first, then call back." 
                }

        # 4. Create a PENDING order (do NOT decrement stock or mark fulfilled)
        order_res = sb.table("orders").insert({
            "patient_id": patient_db_id,
            "status": "pending",
            "total_items": request.quantity,
            "channel": "voice",
        }).execute()
        order_id = order_res.data[0]["id"]

        sb.table("order_items").insert({
            "order_id": order_id,
            "medicine_id": med["id"],
            "qty": request.quantity,
            "frequency_per_day": 1,
            "dosage_text": "As directed",
            "days_supply": 30,
        }).execute()

        # 5. Generate Stripe checkout link so agent can share it with patient
        frontend_base = os.getenv("FRONTEND_URL", "http://localhost:3000")
        stripe_result = await _create_stripe_checkout(
            order_id=order_id,
            success_url=f"{frontend_base}/payment/success",
            cancel_url=f"{frontend_base}/payment/cancel",
        )

        payment_url = stripe_result.get("url", "") if stripe_result.get("success") else ""

        return {
            "success": True,
            "order_id": order_id,
            "medicine_name": med["name"],
            "quantity": request.quantity,
            "payment_url": payment_url,
            "response": (
                f"I've placed a pending order for {request.quantity} unit(s) of {med['name']}. "
                f"Please complete payment to confirm your order. You can find the Pay Now button "
                f"in your Order History tab, or use this link: {payment_url}"
            )
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/")
async def root_voice_order(request: VoiceOrderRequest):
    """
    Fallback webhook for ElevenLabs Agent if it calls the root URL.
    Forwards the request to the main /voice-order endpoint.
    """
    return await voice_order(request)

@app.post("/initiate-call")
async def initiate_call(request: InitiateCallRequest):
    """
    Initiates an outbound Twilio call to the patient.
    Gathers patient context and securely passes it to ElevenLabs.
    """
    if not outbound_call_service:
        raise HTTPException(status_code=503, detail="Outbound calling is not configured on this server.")

    try:
        sb = _get_sb()
        # 1. Fetch patient profile & phone number (if not provided in request)
        pt_res = sb.table("patients").select("id, full_name, phone").eq("user_id", request.patient_id).maybe_single().execute()
        if not pt_res.data:
            raise HTTPException(status_code=404, detail="Patient profile not found.")
        
        patient = pt_res.data
        
        # Prefer the explicitly provided phone number, fallback to profile
        phone = request.phone_number or patient.get("phone")
        if not phone:
            raise HTTPException(status_code=400, detail="No phone number provided or configured in profile.")

        # Ensure phone is E.164 formatted. Simple check, might need better validation in prod.
        if not phone.startswith("+"):
            phone = "+" + phone.lstrip("0") # very basic assumption, frontend should enforce E.164

        # 2. Gather context: active medicines
        meds_res = await get_my_medicines(request.patient_id)
        active_meds = []
        if meds_res.get("success"):
            for order in meds_res.get("orders", []):
                for item in order.get("items", []):
                    med_details = item.get("medicines", {})
                    active_meds.append(med_details.get("name"))
        
        # 3. Gather context: prescriptions uploaded
        recs = sb.table("records").select("title, extracted_text").eq("patient_id", patient["id"]).eq("record_type", "prescription").execute()
        prescriptions = [r["title"] for r in (recs.data or [])]

        context = {
            "patient_id": request.patient_id,
            "patient_name": patient["full_name"],
            "current_medicines": list(set(active_meds)),
            "uploaded_prescriptions": prescriptions
        }

        # 4. Initiate Call
        call_sid = outbound_call_service.initiate_call(to_number=phone, patient_info=context)

        return {"success": True, "message": "Call initiated successfully", "call_sid": call_sid}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/create-checkout-session")
async def create_checkout_session(request: CheckoutSessionRequest):
    """
    Generate a Stripe Checkout Session for an existing pending order.
    """
    try:
        return await _create_stripe_checkout(
            order_id=request.order_id,
            success_url=request.success_url,
            cancel_url=request.cancel_url
        )
    except Exception as e:
        print(f"Checkout Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/voice-pay-link")
async def voice_pay_link(patient_id: str):
    """
    AI Tool endpoint: Find the latest 'pending' order for this patient 
    and return a Stripe payment link.
    """
    try:
        sb = _get_sb()
        # Find latest pending order for this patient
        order_res = (
            sb.table("orders")
            .select("id")
            .eq("patient_id", patient_id)
            .eq("status", "pending")
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        
        if not order_res.data:
            return {"success": False, "error": "No pending orders found for this patient."}
            
        order_id = order_res.data[0]["id"]
        
        # We need a success/cancel URL. For voice, we can point to the dashboard.
        # Ideally, this should be configurable, but we'll use a sensible default.
        base_url = "http://localhost:3000/patient/my-medicines" 
        
        result = await _create_stripe_checkout(
            order_id=order_id,
            success_url=base_url,
            cancel_url=base_url
        )
        
        if result.get("success"):
            # Also log a notification so the user sees it in the app
            try:
                sb.table("notification_logs").insert({
                    "patient_id": patient_id,
                    "channel": "app",
                    "type": "payment_request",
                    "payload": {
                        "order_id": order_id,
                        "payment_url": result["url"],
                        "message": "Payment link generated via voice assistant."
                    },
                    "status": "sent"
                }).execute()
            except Exception as ne:
                print(f"⚠️ Could not log payment notification: {ne}")
            
        return result
        
    except Exception as e:
        print(f"Voice Pay Link Error: {e}")
        return {"success": False, "error": str(e)}


@app.post("/verify-payment")
async def verify_payment(request: VerifyPaymentRequest):
    """
    Finalize pending order after returning from Stripe Checkout.
    Since Stripe only redirects to success_url if payment is complete,
    we trust the redirect and fulfill via DB directly (no SDK re-verify needed).
    """
    try:
        sb = _get_sb()
        # Determine order_id and verify payment status dynamically
        order_id = request.order_id
        if stripe.api_key and not request.session_id.startswith("mock_session"):
            try:
                session = stripe.checkout.Session.retrieve(request.session_id)
                if not order_id:
                    order_id = getattr(session, "client_reference_id", None)
                
                # Strict check: payment must be 'paid'
                if session.payment_status != "paid":
                    return {
                        "success": False, 
                        "error": f"Payment status is '{session.payment_status}'. Order cannot be fulfilled until paid."
                    }
            except Exception as se:
                print(f"Stripe session retrieve failed: {se}")
                return {"success": False, "error": f"Could not verify payment with Stripe: {str(se)}"}
        elif request.session_id.startswith("mock_session"):
            print("INFO: Processing mock session (dynamic check skipped)")

        if not order_id:
            return {"success": False, "error": "Could not determine order ID from session"}

        print(f"Verify: Fulfilling order {order_id} for session {request.session_id}")

        # Fetch the order
        order_res = (
            sb.table("orders")
            .select("status, order_items(medicine_id, qty)")
            .eq("id", order_id)
            .single()
            .execute()
        )
        if not order_res.data:
            return {"success": False, "error": f"Order {order_id} not found"}

        if order_res.data["status"] == "fulfilled":
            return {"success": True, "message": "Order already fulfilled — your medicines are on the way! ✅"}

        # Decrement stock for each item
        for item in order_res.data["order_items"]:
            try:
                sb.rpc("decrement_medicine_stock", {
                    "p_medicine_id": item["medicine_id"],
                    "p_qty": item["qty"],
                }).execute()
            except Exception as de:
                print(f"Stock decrement warn: {de}")

        # Mark order as fulfilled
        from datetime import datetime, timezone
        sb.table("orders").update({
            "status": "fulfilled",
            "finalized_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", order_id).execute()

        return {"success": True, "message": "Payment confirmed! Your order is being prepared. ✅"}

    except Exception as e:
        print(f"Verify Payment Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/pharmacist/dashboard-data")
async def pharmacist_dashboard_data():
    """
    Fetch all requisite data for the Pharmacist Dashboard,
    bypassing RLS with the service role key.
    Includes robust patient name and item enrichment.
    """
    try:
        sb = _get_sb()

        # 1. Fetch Orders (recent)
        orders_raw = sb.table("orders").select("*").order("created_at", desc=True).limit(50).execute()
        orders = orders_raw.data or []

        # 2. Manual Enrichment for Orders to handle fragmented schema
        for order in orders:
            pid = order.get("patient_id")
            name = "Unknown"
            if pid:
                # 1. Try patients table (UUID/External)
                p_res = sb.table("patients").select("full_name, user_id").eq("id", pid).maybe_single().execute()
                if p_res.data:
                    name = p_res.data.get("full_name") or "Unknown"
                    if (not name or name == "Unknown") and p_res.data.get("user_id"):
                        # 2. Try profiles table (Auth link)
                        prof = sb.table("profiles").select("full_name").eq("id", p_res.data["user_id"]).maybe_single().execute()
                        if prof.data:
                            name = prof.data.get("full_name", "Unknown")
            
            order["patient_name"] = name
            
            # Enrich items
            oid = order.get("id")
            items_res = sb.table("order_items").select("qty, medicines(name)").eq("order_id", oid).execute()
            order["order_items"] = items_res.data or []

        # 3. Fetch Low Inventory
        inventory_res = sb.table("medicines").select("*").order("stock", desc=False).limit(50).execute()

        # 4. Fetch Refill Alerts & Enrich
        alerts_raw = sb.table("refill_alerts").select("*").eq("status", "pending").order("predicted_runout_date", desc=False).execute()
        alerts = alerts_raw.data or []
        for alert in alerts:
            pid = alert.get("patient_id")
            mid = alert.get("medicine_id")
            
            p_name = "Unknown"
            if pid:
                p_res = sb.table("patients").select("full_name").eq("id", pid).maybe_single().execute()
                if p_res.data: p_name = p_res.data.get("full_name", "Unknown")
            
            m_name = "Unknown"
            if mid:
                m_res = sb.table("medicines").select("name").eq("id", mid).maybe_single().execute()
                if m_res.data: m_name = m_res.data.get("name", "Unknown")
            
            alert["patient_name"] = p_name
            alert["medicine_name"] = m_name

        # 5. Fetch low stock notifications
        notif_res = sb.table("notification_logs").select("*").order("created_at", desc=True).limit(10).execute()

        # 6. Fetch all medicines
        all_meds_res = sb.table("medicines").select("*").order("name", desc=False).execute()

        # 7. Fetch raw history
        raw_res = sb.table("order_history_raw").select("*").order("purchase_date", desc=True).limit(100).execute()

        return {
            "success": True,
            "orders": orders,
            "inventory": inventory_res.data or [],
            "refillAlerts": alerts,
            "notifications": notif_res.data or [],
            "allMedicines": all_meds_res.data or [],
            "orderHistory": raw_res.data or []
        }
    except Exception as e:
        print(f"Pharmacist DB Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

class UpdateOrderRequest(BaseModel):
    order_id: str
    status: str

@app.post("/pharmacist/update-order")
async def pharmacist_update_order(request: UpdateOrderRequest):
    try:
        sb = _get_sb()
        # The frontend handles client-side decrement, or we can handle it here if it's approved.
        # But wait, manual-order ALREADY decrements stock. What if Voice order is approved?
        if request.status in ["approved", "fulfilled"]:
            items_res = sb.table("order_items").select("medicine_id, qty").eq("order_id", request.order_id).execute()
            for item in items_res.data or []:
                try:
                    sb.rpc("decrement_medicine_stock", {
                        "p_medicine_id": item["medicine_id"],
                        "p_qty": item["qty"]
                    }).execute()
                except Exception as de:
                    print(f"Stock decrement warn: {de}")

        sb.table("orders").update({"status": request.status}).eq("id", request.order_id).execute()
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class UpdateMedicineRequest(BaseModel):
    medicine_id: str
    stock: int

@app.post("/pharmacist/update-medicine")
async def pharmacist_update_medicine(request: UpdateMedicineRequest):
    try:
        sb = _get_sb()
        sb.table("medicines").update({"stock": request.stock}).eq("id", request.medicine_id).execute()
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/doctor/dashboard-data")
async def doctor_dashboard_data(user_id: str):
    """
    Fetch doctor profile + consents + patients for the Doctor Dashboard,
    bypassing RLS with the service role key.
    """
    try:
        sb = _get_sb()

        # 1. Fetch doctor profile by auth user_id or PK id
        # First, check 'doctors' table by 'user_id'
        doc_res = sb.table("doctors").select("id,user_id,name,license_id,specialization,verified,shift_type,ward_assigned") \
            .eq("user_id", user_id).maybe_single().execute()
            
        # If not found by 'user_id', try searching by 'id' (PK) which useAuth sets
        if not doc_res or not doc_res.data:
            doc_res = sb.table("doctors").select("id,user_id,name,license_id,specialization,verified,shift_type,ward_assigned") \
                .eq("id", user_id).maybe_single().execute()

        # If STILL not found, or if name is missing, consult 'profiles' table
        doc_data = doc_res.data if doc_res and doc_res.data else {}
        
        # Pull name from central profiles if missing in doctors table
        profile_res = sb.table("profiles").select("full_name").eq("id", user_id).maybe_single().execute()
        if profile_res and profile_res.data:
            doc_data["name"] = doc_data.get("name") or profile_res.data.get("full_name") or "Doctor"
        
        if not doc_data:
            print(f"⚠️ Doctor Profile Not Found for user_id: {user_id}")
            return {"success": False, "error": "Doctor profile not found. Please ensure you are logged in as a doctor or complete setup."}

        doc = doc_data
        doctor_id = doc.get("id") or user_id # Fallback to user_id for relations if needed
        
        if not doctor_id:
             return {"success": False, "error": "Invalid doctor profile structure."}

        # 2. Fetch consents for this doctor
        consents_res = sb.table("consent_requests") \
            .select("id,patient_id,doctor_id,status,expires_at,created_at") \
            .eq("doctor_id", doctor_id) \
            .order("created_at", desc=True).execute()
        
        # Try fallback to searching by user_id if id query returned nothing
        if not consents_res.data:
             consents_res = sb.table("consent_requests") \
                .select("id,patient_id,doctor_id,status,expires_at,created_at") \
                .eq("doctor_id", user_id) \
                .order("created_at", desc=True).execute()

        consents = consents_res.data or []

        # 3. Fetch patient details for all consent patient_ids
        # Added robust safety checks to prevent TypeError in list comprehension
        patient_ids = []
        if consents and isinstance(consents, list):
            for c in consents:
                if isinstance(c, dict) and c.get("patient_id"):
                    patient_ids.append(c["patient_id"])
        
        patient_ids = list(set(patient_ids))
        
        patients = []
        if patient_ids:
            pats_res = sb.table("patients").select("id,uhid,full_name").in_("id", patient_ids).execute()
            patients = pats_res.data or []

        return {
            "success": True,
            "doctor": doc,
            "consents": consents,
            "patients": patients,
        }
    except Exception as e:
        print(f"❌ Doctor Dashboard DB Error: {e}")
        return {"success": False, "error": f"Database error: {str(e)}"}

@app.get("/check-rx")
async def check_rx(patient_id: str, medicine_name: str):
    """
    Pre-flight check: does this patient have an uploaded prescription record
    that mentions the given medicine name in its extracted_text?
    Returns {has_prescription: bool}.
    """
    try:
        sb = _get_sb()
        pt = sb.table("patients").select("id").eq("user_id", patient_id).maybe_single().execute()
        if not pt or not pt.data:
            return {"has_prescription": False}
        pid = pt.data["id"]
        recs = (
            sb.table("records")
            .select("extracted_text")
            .eq("patient_id", pid)
            .eq("record_type", "prescription")
            .execute()
        )
        has_rx = any(
            medicine_name.lower() in (r.get("extracted_text") or "").lower()
            for r in (recs.data or [])
        )
        return {"has_prescription": has_rx}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/verify-prescription")
async def verify_prescription(patient_id: str, medicine_name: str):
    """
    Check if a patient has a valid prescription for a medicine.
    Uses PrescriptionAgent logic.
    """
    try:
        from agents.prescription_agent import PrescriptionAgent
        agent = PrescriptionAgent()
        result = await agent.run(medicine_name, {
            "user_id": patient_id,
            "medicine_name": medicine_name,
            "action": "verify"
        })
        return {"success": True, "valid": result.success, "message": result.message, "data": result.data}
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.post("/verify-rx-upload")
@observe()
async def verify_rx_upload(
    patient_id: str = Form(...),
    medicine_name: str = Form(...),
    file: UploadFile = File(...),
):
    """
    Upload a prescription image/PDF and verify it mentions the given medicine.
    Steps:
      1. Read uploaded file bytes
      2. Send to Gemini Vision to extract all text from the document
      3. Check whether medicine_name appears in the extracted text
      4. If valid, save as a prescription record in the records table
      5. Return {valid, message, extracted_text}
    """
    import base64

    try:
        contents = await file.read()
        if not contents:
            return {"valid": False, "message": "Uploaded file is empty.", "extracted_text": ""}

        # Determine MIME type
        mime = file.content_type or "image/jpeg"
        # Convert to base64 for Gemini inline data
        b64 = base64.b64encode(contents).decode("utf-8")

        # Ask Gemini to extract all text from the prescription document
        extraction_prompt = (
            "You are a medical OCR assistant. Extract ALL text from this prescription image "
            "exactly as written. Include medicine names, dosages, instructions, patient name, "
            "doctor name, and date. Output only the extracted text, nothing else."
        )
        response = await safe_generate_content(
            contents=[
                extraction_prompt,
                types.Part.from_bytes(data=contents, mime_type=mime),
            ],
            task_type="text_fast"
        )
        extracted_text = response.text.strip() if response.text else ""

        # Check if the medicine name appears in the extracted text
        med_lower = medicine_name.lower()
        if med_lower not in extracted_text.lower():
            return {
                "valid": False,
                "message": (
                    f"❌ Prescription does not mention **{medicine_name}**. "
                    "Please upload a valid prescription that includes this medicine."
                ),
                "extracted_text": extracted_text,
            }

        # Valid prescription — save to records table for future reference
        try:
            sb = _get_sb()
            pt = sb.table("patients").select("id").eq("user_id", patient_id).single().execute()
            if pt.data:
                pid = pt.data["id"]
                sb.table("records").insert({
                    "patient_id": pid,
                    "uploaded_by": patient_id,   # auth uid
                    "record_type": "prescription",
                    "title": f"Prescription – {medicine_name}",
                    "extracted_text": extracted_text,
                    "file_name": file.filename or "prescription.jpg",
                    "file_size": len(contents),
                    "notes": f"Auto-uploaded during medicine purchase for {medicine_name}",
                }).execute()
        except Exception as save_err:
            print(f"⚠️ Could not save prescription record: {save_err}")
            # Don't fail the verification if saving fails

        return {
            "valid": True,
            "message": f"✅ Valid prescription found for **{medicine_name}**. You can proceed with the order.",
            "extracted_text": extracted_text,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Pharmacist Dashboard Data (bypasses RLS via service role key) ─────────────

@app.get("/pharmacist/recent-orders")
async def pharmacist_recent_orders(limit: int = 50):
    """
    Returns all recent orders with patient names and order items.
    Uses service role key so RLS is bypassed - for pharmacist dashboard.
    """
    try:
        sb = _get_sb()
        # Fetch orders with joined patient profile and order items
        res = sb.table("orders").select(
            "id, status, created_at, patient_id"
        ).order("created_at", desc=True).limit(limit).execute()

        orders = res.data or []

        # Enrich each order with patient name and items
        for order in orders:
            pid = order.get("patient_id")
            name = "Unknown"
            if pid:
                # Try patients table first (may have full_name directly)
                try:
                    pt = sb.table("patients").select("full_name, user_id").eq("id", pid).maybe_single().execute()
                    if pt.data and pt.data.get("full_name"):
                        name = pt.data["full_name"]
                    elif pt.data and pt.data.get("user_id"):
                        # Follow user_id → profiles.full_name
                        prof = sb.table("profiles").select("full_name").eq("id", pt.data["user_id"]).maybe_single().execute()
                        if prof.data:
                            name = prof.data.get("full_name", "Unknown")
                    else:
                        # Fallback: try profiles directly with pid
                        prof = sb.table("profiles").select("full_name").eq("id", pid).maybe_single().execute()
                        if prof.data:
                            name = prof.data.get("full_name", "Unknown")
                except Exception:
                    pass
            order["patient_name"] = name

            # Get order items with medicine names
            items_res = sb.table("order_items").select(
                "id, qty, medicine_id, medicines(name)"
            ).eq("order_id", order["id"]).execute()
            order["order_items"] = items_res.data or []

        return {"success": True, "orders": orders}
    except Exception as e:
        print(f"Pharmacist orders error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/pharmacist/refill-alerts")
async def pharmacist_refill_alerts():
    """
    Returns pending refill alerts with patient names and medicine info.
    Uses service role key to bypass RLS.
    Falls back to low-stock medicines if no real alerts exist.
    """
    try:
        sb = _get_sb()

        # 1. Try real refill_alerts table
        alerts_res = sb.table("refill_alerts").select(
            "id, status, predicted_runout_date, patient_id, medicine_id"
        ).eq("status", "pending").order("predicted_runout_date", desc=False).execute()

        alerts = alerts_res.data or []

        enriched = []
        for alert in alerts:
            item = {
                "id": alert["id"],
                "status": alert["status"],
                "predicted_runout_date": alert.get("predicted_runout_date"),
                "patient_name": "Unknown",
                "medicine_name": "Unknown",
            }

            # Resolve patient name
            pid = alert.get("patient_id")
            if pid:
                try:
                    pt = sb.table("patients").select("full_name, user_id").eq("id", pid).maybe_single().execute()
                    if pt.data and pt.data.get("full_name"):
                        item["patient_name"] = pt.data["full_name"]
                    elif pt.data and pt.data.get("user_id"):
                        prof = sb.table("profiles").select("full_name").eq("id", pt.data["user_id"]).maybe_single().execute()
                        if prof.data:
                            item["patient_name"] = prof.data.get("full_name", "Unknown")
                    else:
                        prof = sb.table("profiles").select("full_name").eq("id", pid).maybe_single().execute()
                        if prof.data:
                            item["patient_name"] = prof.data.get("full_name", "Unknown")
                except Exception:
                    pass

            # Resolve medicine name
            mid = alert.get("medicine_id")
            if mid:
                try:
                    med = sb.table("medicines").select("name, stock").eq("id", mid).maybe_single().execute()
                    if med.data:
                        item["medicine_name"] = med.data.get("name", "Unknown")
                        item["current_stock"] = med.data.get("stock", 0)
                except Exception:
                    pass

            enriched.append(item)

        # 2. Fallback: if no alerts, use low-stock medicines as synthetic refill items
        if not enriched:
            low_stock = sb.table("medicines").select(
                "id, name, stock, reorder_threshold"
            ).lte("stock", 10).order("stock", desc=False).limit(5).execute()

            for med in (low_stock.data or []):
                enriched.append({
                    "id": med["id"],
                    "status": "pending",
                    "predicted_runout_date": None,
                    "patient_name": None,  # system alert, no patient
                    "medicine_name": med.get("name", "Unknown"),
                    "current_stock": med.get("stock", 0),
                    "is_stock_alert": True,
                })

        return {"success": True, "refill_alerts": enriched}
    except Exception as e:
        print(f"Pharmacist refill-alerts error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── Dose-consumption models ──────────────────────────────────────────────────

class ConsumeDoseRequest(BaseModel):
    patient_id: str      # auth.uid()
    order_item_id: str   # order_items.id


@app.post("/consume-dose")
async def consume_dose(request: ConsumeDoseRequest):
    """
    "Taken" button for as-needed medicines.
    Decrements order_items.qty by 1 for the given item.
    Only allowed if qty > 0 and the item belongs to the requesting patient.
    """
    try:
        sb = _get_sb()

        # Verify ownership: trace order_item → order → patients.user_id
        item_res = (
            sb.table("order_items")
            .select("id, qty, orders(patient_id, patients(user_id))")
            .eq("id", request.order_item_id)
            .maybe_single()
            .execute()
        )
        if not item_res.data:
            raise HTTPException(status_code=404, detail="Order item not found")

        item = item_res.data
        owner_uid = (
            item.get("orders", {}).get("patients", {}).get("user_id")
        )
        if owner_uid != request.patient_id:
            raise HTTPException(status_code=403, detail="Not your medicine")

        current_qty = item.get("qty", 0)
        if current_qty <= 0:
            return {"success": False, "error": "No remaining units to consume"}

        new_qty = current_qty - 1
        sb.table("order_items").update({"qty": new_qty}).eq("id", request.order_item_id).execute()

        return {"success": True, "remaining": new_qty}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/log-dose")
async def log_dose(request: LogDoseRequest):
    """
    Log an adherence event (taken/missed) for a medicine dose.
    """
    try:
        sb = _get_sb()
        # Insert log into medication_logs table
        sb.table("medication_logs").insert({
            "user_id": request.user_id,
            "medicine_id": request.medicine_id,
            "order_item_id": request.order_item_id,
            "status": request.status,
            "scheduled_time": request.scheduled_time
        }).execute()

        return {"success": True}
    except Exception as e:
        print(f"Log dose error: {e}")
        # Soft fail if table doesn't exist yet
        return {"success": False, "error": str(e)}

@app.get("/adherence-report")
async def adherence_report(patient_id: str):
    """
    Get adherence statistics and history for a patient.
    """
    try:
        sb = _get_sb()
        # Get logs
        logs_res = sb.table("medication_logs").select("*").eq("user_id", patient_id).order("created_at", desc=False).execute()
        logs = logs_res.data or []
        
        # Calculate stats
        total = len(logs)
        taken = sum(1 for l in logs if l.get("status") == "taken")
        missed = total - taken
        adherence_pct = round((taken / total * 100) if total > 0 else 0)
        
        return {
            "success": True, 
            "logs": logs,
            "stats": {
                "total": total,
                "taken": taken,
                "missed": missed,
                "adherence_pct": adherence_pct
            }
        }
    except Exception as e:
        print(f"Adherence report error: {e}")
        return {"success": False, "error": str(e), "logs": [], "stats": {"total": 0, "taken": 0, "missed": 0, "adherence_pct": 0}}

@app.post("/set-reminder")
async def set_reminder(request: SetReminderRequest):
    """
    Set custom reminder time for a medication.
    """
    try:
        sb = _get_sb()
        sb.table("reminders").insert({
            "user_id": request.user_id,
            "medicine_id": request.medicine_id,
            "order_item_id": request.order_item_id,
            "reminder_time": request.reminder_time,
            "frequency": request.frequency
        }).execute()
        return {"success": True}
    except Exception as e:
        print(f"Set reminder error: {e}")
        return {"success": False, "error": str(e)}


@app.get("/due-doses")
async def due_doses(patient_id: str):
    """
    Return order_items for this patient's fulfilled orders that have
    frequency_per_day set (scheduled medicines), so the frontend can
    show next-dose info. Also returns IST current hour for reference.
    """
    try:
        from datetime import datetime, timezone, timedelta
        IST = timezone(timedelta(hours=5, minutes=30))
        now_ist = datetime.now(IST)

        sb = _get_sb()
        pt = sb.table("patients").select("id").eq("user_id", patient_id).single().execute()
        if not pt.data:
            return {"success": True, "items": [], "now_ist_hour": now_ist.hour}
        pid = pt.data["id"]

        orders_res = (
            sb.table("orders")
            .select("id")
            .eq("patient_id", pid)
            .in_("status", ["fulfilled", "approved"])
            .execute()
        )
        order_ids = [o["id"] for o in (orders_res.data or [])]
        if not order_ids:
            return {"success": True, "items": [], "now_ist_hour": now_ist.hour}

        items_res = (
            sb.table("order_items")
            .select("id, qty, frequency_per_day, dosage_text, medicines(name)")
            .in_("order_id", order_ids)
            .not_.is_("frequency_per_day", "null")
            .gt("qty", 0)
            .execute()
        )
        return {"success": True, "items": items_res.data or [], "now_ist_hour": now_ist.hour}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Background auto-decrement scheduler ─────────────────────────────────────
# Dose windows in IST hours. When the backend clock ticks past one of these,
# we decrement qty by 1 for all scheduled (frequency_per_day >= window index)
# active order_items across all patients.
_DOSE_WINDOWS_IST = [8, 14, 20]   # 08:00, 14:00, 20:00 IST
_last_decremented_window: set = set()   # tracks "YYYY-MM-DD:HH" already processed

def _run_scheduled_decrement():
    """Background thread: checks every minute if a dose window has arrived."""
    import threading
    from datetime import datetime, timezone, timedelta

    IST = timezone(timedelta(hours=5, minutes=30))

    def _decrement_loop():
        global _last_decremented_window
        while True:
            try:
                now = datetime.now(IST)
                window_key = f"{now.date()}:{now.hour}"

                if now.hour in _DOSE_WINDOWS_IST and window_key not in _last_decremented_window:
                    _last_decremented_window.add(window_key)
                    _do_auto_decrement(now.hour)

                # Prune old keys (keep only today's)
                today = str(now.date())
                _last_decremented_window = {k for k in _last_decremented_window if k.startswith(today)}

            except Exception as exc:
                print(f"⚠️ Auto-decrement scheduler error: {exc}")
            time.sleep(60)   # check every minute

    t = threading.Thread(target=_decrement_loop, daemon=True, name="dose-scheduler")
    t.start()
    print("⏰ Dose scheduler started (windows: 08:00, 14:00, 20:00 IST)")


def _do_auto_decrement(ist_hour: int):
    """
    At dose window ist_hour, decrement qty by 1 for every active order_item
    whose medicine is scheduled (frequency_per_day >= number of windows per day
    that map to or before this hour).
    """
    try:
        from datetime import datetime, timezone, timedelta
        sb = _get_sb()

        # Window index: 08→1, 14→2, 20→3
        window_index = _DOSE_WINDOWS_IST.index(ist_hour) + 1

        # Fetch all fulfilled/approved order items with frequency_per_day set and qty > 0
        orders_res = sb.table("orders").select("id").in_("status", ["fulfilled", "approved"]).execute()
        if not orders_res.data:
            return

        order_ids = [o["id"] for o in orders_res.data]
        items_res = (
            sb.table("order_items")
            .select("id, qty, frequency_per_day, medicines(name)")
            .in_("order_id", order_ids)
            .gte("frequency_per_day", window_index)   # e.g. at 14:00, only items with freq>=2
            .gt("qty", 0)
            .execute()
        )
        items = items_res.data or []
        decremented = 0
        for item in items:
            new_qty = max(0, item["qty"] - 1)
            sb.table("order_items").update({"qty": new_qty}).eq("id", item["id"]).execute()
            decremented += 1

        print(f"⏰ Auto-decrement @ IST {ist_hour:02d}:00 — {decremented} items decremented")
    except Exception as exc:
        print(f"❌ Auto-decrement failed: {exc}")


# ── App lifespan (start scheduler on boot) ───────────────────────────────────
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app_instance):
    _run_scheduled_decrement()
    yield


# Patch the lifespan onto the existing app
app.router.lifespan_context = lifespan


@app.post("/pharmacy/chat")
@observe()
async def pharmacy_chat(request: PharmacyChatRequest):
    """
    Expert Pharmacy Agent — powered by the multi-agent orchestrator.
    Delegates to PharmacyAgent (search, prescription check, order + stock decrement),
    RefillAgent, NotificationAgent, and HealthAgent based on user intent.
    Returns the same ChatResponse shape as before — no frontend changes needed.
    """
    try:
        from agents.orchestrator_agent import OrchestratorAgent as _OrchestratorAgent
        if not hasattr(pharmacy_chat, "_orchestrator"):
            pharmacy_chat._orchestrator = _orchestrator

        print(f"💊 Expert Pharmacy Query (multi-agent): {request.message}")

        # The frontend sends patient_id = auth.uid() — pass as user_id so every
        # sub-agent resolves patients.id (FK in orders/refills) correctly.
        result = await pharmacy_chat._orchestrator.run(
            message=request.message,
            user_id=request.patient_id,
            language=request.language,
        )

        ai_text = result.get("response", "")

        # Voice synthesis — identical to the original implementation
        audio_data_b64 = None
        if request.use_voice and ai_text:
            try:
                audio_bytes = await voice_service.synthesize_empathic(ai_text, request.language)
                if audio_bytes:
                    import base64
                    audio_data_b64 = base64.b64encode(audio_bytes).decode("utf-8")
            except Exception as ve:
                print(f"⚠️ Pharmacy Voice synthesis failed: {ve}")

        return ChatResponse(success=True, response=ai_text, audio_data=audio_data_b64)

    except Exception as e:
        print(f"❌ Pharmacy Chat Error: {e}")
        import traceback
        traceback.print_exc()
        error_msg = str(e)
        fallbacks = {
            "hi": "मुझे अभी आपके फार्मेसी रिकॉर्ड्स में परेशानी हो रही है। कृपया थोड़ी देर बाद फिर से प्रयास करें।",
            "mr": "मला आता तुमच्या फार्मसी रेकॉर्डमध्ये अडचण येत आहे. कृपया थोड्या वेळाने पुन्हा प्रयत्न करा.",
            "en": "I'm having trouble with my pharmacy records. Please try again.",
        }
        quota_fallbacks = {
            "hi": "मुझे अभी बहुत सारे अनुरोध मिल रहे हैं। कृपया एक पल प्रतीक्षा करें और पुन: प्रयास करें।",
            "mr": "मला सध्या खूप विनंत्या येत आहेत. कृपया क्षणभर थांबा आणि पुन्हा प्रयत्न करा.",
            "en": "I'm currently receiving too many requests. Please wait a moment and try again.",
        }
        lang = getattr(request, "language", "en")
        if "429" in error_msg or "quota" in error_msg.lower() or "RESOURCE_EXHAUSTED" in error_msg:
            return ChatResponse(success=False, response=quota_fallbacks.get(lang, quota_fallbacks["en"]), error=error_msg)
        return ChatResponse(success=False, response=fallbacks.get(lang, fallbacks["en"]), error=error_msg)


@app.post("/patient/smart-insights")
async def get_smart_insights(request: SmartInsightsRequest):
    """
    Generate AI correlation insights based on adherence and lifestyle routines.
    """
    try:
        sb = _get_sb()
        # 1. Fetch adherence logs
        med_res = sb.table("medication_logs").select("status").eq("user_id", request.user_id).order("created_at", desc=True).limit(50).execute()
        med_logs = med_res.data or []
        taken = sum(1 for m in med_logs if m.get('status') == 'taken')
        total = len(med_logs)
        adherence = round((taken / max(total, 1)) * 100) if total > 0 else 0

        # 2. Fetch routines
        routine_res = sb.table("health_routines").select("metric_type, value, unit, logged_at").eq("user_id", request.user_id).order("created_at", desc=True).limit(20).execute()
        routines = routine_res.data or []
        
        routine_summary = ", ".join([f"{r.get('metric_type')}: {r.get('value')} {r.get('unit')}" for r in routines]) or "No recent routines logged."

        prompt = f"The patient currently has {adherence}% medicine adherence (from {total} recent scheduled doses). Their recent lifestyle habits logged are: {routine_summary}. As a professional and warm AI clinician, write ONE short paragraph (maximum 2 sentences) providing a brilliant, encouraging clinical insight that correlates their medicine adherence with their lifestyle habits. Avoid complex medical jargon. Be supportive and engaging! DO NOT USE asterisks or markdown."

        response = await safe_generate_content(
            contents=prompt,
            task_type="text_fast"
        )

        return {"success": True, "insight": response.text}
    except Exception as e:
        print(f"❌ Smart Insights Error: {e}")
        return {"success": False, "insight": "Start logging your doses and habits to receive personalized AI insights on how your lifestyle impacts your medication effectiveness!"}

@app.post("/patient/daily-agenda")
async def get_daily_agenda(request: DailyAgendaRequest):
    """
    Generate a personalized AI daily agenda using:
    - Active prescriptions (medicines + schedule)
    - 7-day lifestyle history (hydration, steps averages)
    Returns a structured JSON agenda with medicines list, hydration goal, steps goal, and a tip.
    """
    try:
        sb = _get_sb()

        # 0. Resolve auth user_id → patients.id (orders.patient_id references patients.id)
        patient_db_id = get_patient_db_id(request.user_id)

        # 1. Fetch active orders with medicine details using correct DB column names
        medicines_summary = []
        if patient_db_id:
            orders_res = sb.table("orders").select(
                "id, status, created_at, items:order_items(id, qty, frequency_per_day, dosage_text, medicine_id:medicines(id, name, strength))"
            ).eq("patient_id", patient_db_id).in_("status", ["approved", "fulfilled", "pending"]).order("created_at", desc=True).limit(5).execute()

            for order in (orders_res.data or []):
                for item in (order.get("items") or []):
                    freq = item.get("frequency_per_day", 0) or 0
                    med = item.get("medicine_id") or {}
                    if freq and med.get("name"):
                        freq_label = {1: "once", 2: "twice", 3: "three times", 4: "four times"}.get(freq, f"{freq} times")
                        medicines_summary.append({
                            "name": f"{med['name']} {med.get('strength', '')}",
                            "freq": freq_label,
                            "med_id": med.get("id"),
                            "item_id": item.get("id")
                        })


        # 2. Fetch last 7 days lifestyle routines
        from datetime import datetime, timedelta
        week_ago = (datetime.utcnow() - timedelta(days=7)).isoformat()
        routines_res = sb.table("health_routines").select("metric_type, value").eq("user_id", request.user_id).gte("logged_at", week_ago).execute()
        routines = routines_res.data or []

        hydration_logs = [int(r["value"]) for r in routines if r["metric_type"] == "hydration" and r["value"].isdigit()]
        steps_logs = [int(r["value"]) for r in routines if r["metric_type"] == "steps" and r["value"].isdigit()]

        avg_water = round(sum(hydration_logs) / max(len(hydration_logs), 1)) if hydration_logs else None
        avg_steps = round(sum(steps_logs) / max(len(steps_logs), 1)) if steps_logs else None

        # 3. Build Gemini prompt
        med_text = "\n".join(medicines_summary) if medicines_summary else "No active prescriptions."
        hydration_text = f"They average {avg_water} glasses/day over last 7 days." if avg_water else "No hydration data yet."
        steps_text = f"They average {avg_steps} steps/day over last 7 days." if avg_steps else "No steps data yet."

        prompt = f"""You are a warm, expert clinical health assistant. Based on the following patient data, generate a personalized daily health agenda in strict JSON format.

Patient's Active Medicines:
{med_text}

Patient's Lifestyle History (last 7 days):
- Hydration: {hydration_text}
- Steps: {steps_text}

Generate a JSON object with EXACTLY this structure (no markdown, no extra text, pure JSON):
{{
  "medicines": [
    {{"time": "08:00", "name": "Medicine Name Strength", "note": "Take with water", "med_id": "UUID", "item_id": "UUID"}},
    ...more timed items...
  ],
  "hydration_goal": <integer number of glasses, realistic based on their history, minimum 6>,
  "steps_goal": <integer steps, realistic improvement on their average, minimum 3000>,
  "daily_tip": "<one encouraging, specific clinical tip for today based on their profile>"
}}

Rules:
- Use the provided med_id and item_id for each medicine.
- Distribute medicine times sensibly across 08:00, 14:00, 20:00 based on frequency
- If no medicines, suggest general wellness items
- hydration_goal should gently push above their average (e.g. avg 5 → goal 7)
- steps_goal should be realistic and motivating
- daily_tip must reference their specific situation
- Return ONLY the JSON, nothing else"""

        response = safe_generate_content(
            contents=prompt,
            task_type="text_fast"
        )

        raw = response.text.strip()
        # Strip markdown if model adds it
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        
        import json as json_lib
        agenda = json_lib.loads(raw.strip())
        return {"success": True, "agenda": agenda}

    except Exception as e:
        print(f"❌ Daily Agenda Error: {e}")
        # Fallback agenda
        return {"success": True, "agenda": {
            "medicines": [],
            "hydration_goal": 8,
            "steps_goal": 5000,
            "daily_tip": "Start small — even a 10-minute walk and 6 glasses of water today can make a big difference!"
        }}

@app.post("/health_trends")
@app.post("/patient/health-trends")
async def get_health_trends(request: HealthAnalysisRequest):
    """
    Get historical health trends (BP, Sugar, etc.) from uploaded records.
    Synced with latest triage vitals if available.
    """
    try:
        # 1. Resolve patient ID
        patient_db_id = get_patient_db_id(request.user_id)
        if not patient_db_id:
            return {"success": True, "timeline": []}
        
        # We need the user_id (auth.uid) for records search
        auth_uid = get_auth_user_id(patient_db_id)
        
        # 2. Fetch historical records
        history = await rag_service.get_patient_records_with_dates(auth_uid or request.user_id)
        
        timeline = []
        for record in history:
            clean_text = record['text'].lower().replace(':', ' ').replace('-', ' ').replace('\n', ' ').replace('*', ' ').replace('#', ' ')
            vitals = parse_medical_text(clean_text)
            if any(v is not None for v in [vitals['systolic'], vitals['sugar'], vitals['heart_rate'], vitals['weight']]):
                timeline.append({
                    "date": record['date'],
                    "systolic": vitals['systolic'],
                    "diastolic": vitals['diastolic'],
                    "sugar": vitals['sugar'],
                    "heart_rate": vitals['heart_rate'],
                    "weight": vitals['weight']
                })
        
        # 3. Add latest Triage vitals as the current point
        sb = _get_sb()
        triage_res = sb.table("triage_queue") \
            .select("vitals, arrival_time") \
            .eq("patient_id", patient_db_id) \
            .order("arrival_time", desc=True) \
            .limit(1) \
            .execute()
        
        if triage_res.data:
            tv = triage_res.data[0].get("vitals", {})
            t_arrival = triage_res.data[0].get("arrival_time")
            
            # Map triage vitals to trend format
            systolic, diastolic = None, None
            if tv.get('bp') and '/' in tv.get('bp'):
                try:
                    parts = tv['bp'].split('/')
                    systolic = int(parts[0])
                    diastolic = int(parts[1])
                except: pass
            
            timeline.append({
                "date": t_arrival,
                "systolic": systolic,
                "diastolic": diastolic,
                "sugar": None, # Triage doesn't usually have sugar unless symptom
                "heart_rate": int(tv.get('hr')) if tv.get('hr') else None,
                "weight": None,
                "is_triage": True
            })

        return {
            "success": True,
            "timeline": timeline
        }
    except Exception as e:
        print(f"❌ Trends Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/")
async def root():
    return {
        "service": "Healthcare AI Assistant",
        "version": "2.0.0",
        "features": ["Chat", "Voice", "RAG", "Health Analysis"]
    }


# In-memory storage for chat history
# Format: { user_id: [ {"role": "user", "parts": ["msg"]}, {"role": "model", "parts": ["response"]} ] }

@app.post("/chat")
@observe()
async def chat(request: ChatRequest):
    """
    Main chat endpoint with RAG support, context window, and optional voice output
    """
    try:
        print(f"📩 Chat Query: {request.message}")
        print(f"🎤 Use Voice: {request.use_voice}")
        print(f"🔐 Use Records: {request.use_records}")
        
        user_id = request.user_id or "anonymous"
        
        # Initialize history for user if not exists
        if user_id not in chat_sessions:
            chat_sessions[user_id] = []
        
        # Get recent history (limit to last 12 messages [6 prompts] for context window management)
        recent_history = chat_sessions[user_id][-12:]
        
        # Format history for prompt
        history_text = ""
        for msg in recent_history:
            role = "User" if msg["role"] == "user" else "Assistant"
            content = msg["parts"][0]
            history_text += f"{role}: {content}\n"

        context_text = ""
        
        # Search medical records if enabled
        if request.user_id and request.use_records:
            context_text = await rag_service.search_records(
                user_id=request.user_id,
                query=request.message
            )
            if context_text:
                print(f"✅ Found relevant medical records")
        
        # Detect if message is a greeting or casual conversation
        greeting_keywords = [
            'hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening',
            'how are you', 'whats up', "what's up", 'greetings', 'namaste', 
            'thanks', 'thank you', 'bye', 'goodbye', 'see you', 'ok', 'okay',
            'cool', 'nice', 'great', 'awesome', 'perfect'
        ]
        is_greeting = any(request.message.lower().strip() in keyword or keyword in request.message.lower() 
                         for keyword in greeting_keywords)
        
        # Detect if user wants detailed explanation
        detail_keywords = ['explain', 'detail', 'elaborate', 'tell me more', 'in depth', 'long', 'why', 'how does']
        wants_detail = any(keyword in request.message.lower() for keyword in detail_keywords)
        print(f"👋 Is greeting: {is_greeting}")
        print(f"📝 Detail mode: {wants_detail}")
        
# Build simple, adaptive system prompt
        if is_greeting and not history_text: # Only use greeting prompt if it's the start
            # Simple conversational prompt for greetings
            system_prompt = f"""
You are a friendly Healthcare AI assistant. The user sent a greeting or casual message.

Respond warmly and naturally in a conversational way. Keep it SHORT (1-2 sentences max).
Be friendly and welcoming. Let them know you're here to help with health questions.

Examples:
- User: "Hi" -> "Hello! 👋 I'm your healthcare assistant. How can I help you today?" (But translate this to the chosen language)

LANGUAGE REQUIREMENT: 
- **Detect and Match**: Match the user's conversational language. If the user greets you in Hindi/Marathi (e.g., "Namaste", "Mera naam..."), respond in that language.
- **Script Policy**: 
  - If Hindi/Marathi -> Use Devanagari script.
  - If English -> Use English.
- **UI Guide**: The user's current UI language is '{request.language}'.
- **Strict Consistency**: Never mix scripts. 100% Devanagari for Hindi/Marathi.
"""
        else:
            # Structured medical response prompt
            system_prompt = f"""
You are a friendly, empathetic Healthcare AI. 

PREVIOUS CONVERSATION HISTORY:
{history_text}

CONTEXT FROM RECORDS: {context_text}

CORE INSTRUCTIONS:
1. **LANGUAGE**: Prioritize matching the user's conversational language.
   - If the user uses Hindi or Marathi (even in Roman script), you MUST respond in that language using Devanagari script.
   - UI language hint: '{request.language}'.
   - Even if the user uses a few English words, DO NOT answer in English if the core conversation is Hindi/Marathi. Translate technical medical terms into the target script.
   - CRITICAL: Never mix scripts. 100% Devanagari for Hindi/Marathi.
   
2. **TONE**: Balanced and Professional yet Caring. 
   - **Show Empathy appropriately**: If the user mentions pain, sickness, or worry, START with a brief validating phrase (e.g., "I'm sorry to hear you're not feeling well" or "That sounds painful"). 
   - **Do NOT overdo it**: Avoid being overly dramatic or flowery. Keep it grounded.
   - For general information questions (e.g., "benefits of turmeric"), skip the empathy and go straight to the answer.

3. **FORMAT**: 
   - Start with a direct, helpful answer (1-2 sentences).
   - Use **bullet points** for lists (symptoms, causes, tips) to make it readable.
   - End with a short, encouraging closing or a simple tip.
   - Do NOT force any specific section headers. Flow naturally.

4. **medical_scope**: Only answer health/wellness questions. For others, politely decline.

Language Guidelines:
- Keep sentences short and clear.
- Use simple words (e.g., "tummy" for "abdomen" is okay if context fits, but standard simple English/Hinglish is best).
"""

        
        # Using gemini-2.5-flash as standardized
        try:
            print("🤖 Health Assistant (Using safe_generate_content - MODEL_TEXT_FAST)")
            response = await safe_generate_content(
                contents=system_prompt + "\n\nPatient Message: " + request.message,
                task_type="text_fast",
                config=types.GenerateContentConfig(
                    temperature=0.7,
                    max_output_tokens=2048,
                )
            )
        except Exception as e:
            print(f"❌ Gemini Error: {e}")
            raise e
        
        # Process response
        if hasattr(response, 'text') and response.text:
            ai_text = response.text
        elif hasattr(response, 'candidates') and len(response.candidates) > 0:
            ai_text = response.candidates[0].content.parts[0].text
        
        if ai_text:
            print(f"✅ Got response: {len(ai_text)} characters")
        
        # If no response after retries, use fallback
        if not ai_text:
            print("📝 Using fallback response")
            # Include the error for debugging
            debug_info = f" (Error: {last_error_msg})" if 'last_error_msg' in locals() else ""
            
            error_fallbacks = {
                "hi": f"क्षमा करें, मैं अभी उस अनुरोध को संसाधित नहीं कर सका।{debug_info} कृपया कुछ ही पलों में पुन: प्रयास करें। 💙",
                "mr": f"क्षमस्व, मी आत्ता त्या विनंतीवर प्रक्रिया करू शकलो नाही.{debug_info} कृपया थोड्या वेळात पुन्हा प्रयत्न करा. 💙",
                "en": f"I'm sorry, I couldn't process that request right now.{debug_info} Please try again in a moment. 💙"
            }
            ai_text = error_fallbacks.get(request.language, error_fallbacks["en"])
        else:
            # Store conversation in history if response was successful
            if user_id in chat_sessions:
                chat_sessions[user_id].append({"role": "user", "parts": [request.message]})
                chat_sessions[user_id].append({"role": "model", "parts": [ai_text]})
        
        # Generate voice if requested
        audio_data_b64 = None
        if request.use_voice:
            try:
                audio_bytes = await voice_service.synthesize_empathic(
                    text=ai_text,
                    language=request.language
                )
                if audio_bytes:
                    import base64
                    audio_data_b64 = base64.b64encode(audio_bytes).decode('utf-8')
            except Exception as e:
                print(f"⚠️ Voice synthesis failed: {e}")
                # Continue without voice
        
        return ChatResponse(
            success=True,
            response=ai_text,
            audio_data=audio_data_b64
        )
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Chat Error: {e}")
        import traceback
        traceback.print_exc()
        return ChatResponse(
            success=False,
            response="I'm experiencing technical difficulties. Please try again.",
            error=str(e)
        )

@app.post("/chat/clear")
async def clear_chat(request: ChatClearRequest):
    """
    Clears the chat history session for a given user.
    Called primarily when the user logs out.
    """
    try:
        user_id = request.user_id
        if user_id in chat_sessions:
            del chat_sessions[user_id]
        if hasattr(_orchestrator, "_sessions") and user_id in _orchestrator._sessions:
            del _orchestrator._sessions[user_id]
        print(f"🧹 Cleared chat history for user: {user_id}")
        return {"success": True, "message": "Chat history cleared"}
    except Exception as e:
        print(f"❌ Error clearing chat history: {e}")
        return {"success": False, "error": str(e)}

@app.post("/synthesize_voice")
async def synthesize_voice(request: dict):
    """
    Dedicated endpoint for voice synthesis
    """
    try:
        text = request.get("text", "")
        language = request.get("language", "en")
        
        if not text:
            raise HTTPException(status_code=400, detail="Text is required")
        
        audio_data = await voice_service.synthesize_empathic(text, language)
        
        if not audio_data:
            raise HTTPException(status_code=500, detail="Voice synthesis failed")
        
        # Return audio as streaming response
        return StreamingResponse(
            io.BytesIO(audio_data),
            media_type="audio/mpeg",
            headers={
                "Content-Disposition": "attachment; filename=response.mp3"
            }
        )
        
    except Exception as e:
        print(f"❌ Voice Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/process_document")
async def process_document(request: DocumentProcessRequest):
    """
    Process uploaded medical documents and create embeddings
    """
    try:
        print(f"📥 Processing document: {request.file_url}")
        
        result = await rag_service.process_document(
            file_url=request.file_url,
            record_id=request.record_id,
            patient_id=request.patient_id
        )
        
        return {
            "success": True,
            "chunks": result["chunks"],
            "message": f"Processed {result['chunks']} chunks successfully"
        }
        
    except Exception as e:
        import traceback
        print("❌ CRITICAL: Document Processing Error Traceback:")
        traceback.print_exc()
        return {
            "success": False,
            "error": str(e)
        }

@app.post("/analyze_health")
async def analyze_health(request: HealthAnalysisRequest):
    """
    Analyze patient health risk using ML and Gemini, fully aggregated with patients,
    records, triage queue, health routines, and active medications.
    """
    try:
        sb = _get_sb()
        # 1. Resolve internal patient_db_id (patients.id) and auth_uid
        patient_db_id = get_patient_db_id(request.user_id)
        auth_uid = get_auth_user_id(patient_db_id) if patient_db_id else request.user_id
        
        print(f"🔍 [AI Health Insight Audit] Incoming user_id: {request.user_id} -> patient_db_id: {patient_db_id}, auth_uid: {auth_uid}")

        candidate_ids = list(set(filter(None, [patient_db_id, auth_uid, request.user_id])))

        # 2. Query Patient Demographics from 'patients' table
        patient_info = {}
        calc_age = None
        patient_res = None
        if patient_db_id:
            patient_res = sb.table("patients").select("*").eq("id", patient_db_id).maybe_single().execute()
        if not patient_res or not patient_res.data:
            patient_res = sb.table("patients").select("*").eq("user_id", auth_uid).maybe_single().execute()
            
        if patient_res and patient_res.data:
            patient_info = patient_res.data
            dob_str = patient_info.get("date_of_birth")
            if dob_str:
                try:
                    from datetime import datetime
                    dob = datetime.strptime(str(dob_str), "%Y-%m-%d")
                    today = datetime.now()
                    calc_age = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
                except Exception as e:
                    print(f"⚠️ DOB parse error: {e}")

        structured_vitals = {
            "age": calc_age,
            "blood_group": patient_info.get("blood_group"),
            "full_name": patient_info.get("full_name")
        }

        # 3. Query Active / Recent Triage Entry
        active_triage = None
        for pid in candidate_ids:
            triage_res = sb.table("triage_queue") \
                .select("priority_level, ai_reasoning, vitals, symptoms, status, arrival_time") \
                .eq("patient_id", pid) \
                .order("arrival_time", desc=True) \
                .limit(1) \
                .execute()
            if triage_res.data:
                active_triage = triage_res.data[0]
                break

        if active_triage and active_triage.get("vitals"):
            tv = active_triage["vitals"]
            if isinstance(tv, dict):
                if tv.get("bp"): structured_vitals["bp"] = tv.get("bp")
                if tv.get("hr"): structured_vitals["heart_rate"] = tv.get("hr")
                if tv.get("sugar"): structured_vitals["sugar"] = tv.get("sugar")
                if tv.get("weight"): structured_vitals["weight"] = tv.get("weight")
                if tv.get("height"): structured_vitals["height"] = tv.get("height")

        # 4. Query Health Routines (last 7 days logged vitals & lifestyle)
        from datetime import datetime, timedelta
        week_ago = (datetime.utcnow() - timedelta(days=7)).isoformat()
        
        routines = []
        for uid in candidate_ids:
            routines_res = sb.table("health_routines") \
                .select("metric_type, value, unit, logged_at") \
                .eq("user_id", uid) \
                .gte("logged_at", week_ago) \
                .execute()
            if routines_res.data:
                routines.extend(routines_res.data)
                
        hydration_logs = [int(r["value"]) for r in routines if r["metric_type"] == "hydration" and str(r["value"]).isdigit()]
        steps_logs     = [int(r["value"]) for r in routines if r["metric_type"] == "steps" and str(r["value"]).isdigit()]
        sleep_logs     = [float(r["value"]) for r in routines if r["metric_type"] == "sleep" if r.get("value")]
        
        avg_water = round(sum(hydration_logs) / max(len(hydration_logs), 1), 1) if hydration_logs else None
        avg_steps = round(sum(steps_logs) / max(len(steps_logs), 1)) if steps_logs else None
        avg_sleep = round(sum(sleep_logs) / max(len(sleep_logs), 1), 1) if sleep_logs else None
        
        lifestyle_context = f"""
        Recent Lifestyle Averages (last 7 days):
        - Hydration: {avg_water if avg_water else 'No data'} glasses/day
        - Activity: {avg_steps if avg_steps else 'No data'} steps/day
        - Sleep: {avg_sleep if avg_sleep else 'No data'} hours/night
        """

        # Check routines for direct vitals if missing
        bp_routines = [r["value"] for r in routines if r["metric_type"] == "blood_pressure" and "/" in str(r["value"])]
        sugar_routines = [int(r["value"]) for r in routines if r["metric_type"] == "blood_sugar" and str(r["value"]).isdigit()]
        if bp_routines and not structured_vitals.get("bp"):
            structured_vitals["bp"] = bp_routines[0]
        if sugar_routines and not structured_vitals.get("sugar"):
            structured_vitals["sugar"] = sugar_routines[0]

        # 5. Query Active Orders / Medicines
        active_meds = []
        try:
            for pid in candidate_ids:
                orders_res = sb.table("orders") \
                    .select("id, status, created_at, order_items(dosage_text, frequency_per_day, medicines(name, strength))") \
                    .eq("patient_id", pid) \
                    .limit(5) \
                    .execute()
                if orders_res.data:
                    for o in orders_res.data:
                        items = o.get("order_items", []) or []
                        for item in items:
                            med = item.get("medicines", {}) or {}
                            med_name = med.get("name")
                            if med_name:
                                active_meds.append(f"{med_name} ({med.get('strength', '')}) - {item.get('dosage_text', 'As directed')}")
        except Exception as me:
            print(f"⚠️ Could not fetch active meds: {me}")

        # 6. Fetch Medical Records (RAG)
        text_records = await rag_service.get_patient_records(request.user_id)
        
        print(f"📊 [Data Pipeline Summary] Records found: {len(text_records)}, Triage: {bool(active_triage)}, Meds: {len(active_meds)}, Demographics: {bool(patient_info)}")

        # 7. Run Core ML analysis on aggregated records and structured vitals
        analysis_result = analyze_risk(text_records, structured_vitals)
        print(f"🔬 ML/Regex Result: {analysis_result}")

        # 8. SYNC LOGIC: Escalation based on Triage
        triage_priority = active_triage.get("priority_level") if active_triage else None
        if triage_priority in ["RED", "ORANGE"]:
            analysis_result['risk_level'] = "Critical"
        elif triage_priority == "YELLOW":
            if analysis_result['risk_level'] == "Healthy":
                analysis_result['risk_level'] = "Warning"

        # Prepare display vitals
        vitals = analysis_result['vitals_detected']
        vitals_str = ", ".join([f"{k}: {v}" for k, v in vitals.items() if v is not None])
        
        triage_context = ""
        if active_triage:
            triage_context = f"\nACTIVE EMERGENCY STATUS: Priority Level {triage_priority} - {active_triage.get('ai_reasoning') or 'Emergency triage active'}. Symptoms: {active_triage.get('symptoms', 'None reported')}."

        meds_context = f"Active Prescriptions/Medications: {', '.join(active_meds)}" if active_meds else "No active prescriptions on file."

        records_context = "\n".join(text_records) if text_records else "No additional uploaded medical documents."

        prompt = f"""
        You are an expert clinical AI assistant producing an AI Health Insight report.
        
        PATIENT PROFILE:
        - Name: {patient_info.get('full_name', 'Patient')}
        - Biological Age: {vitals.get('age') or 'Not recorded'}
        - Blood Group: {vitals.get('blood_group') or 'Not recorded'}
        
        CURRENT CLINICAL STATUS:
        - Risk Level: {analysis_result['risk_level']}
        - Patient Vitals: {vitals_str if vitals_str else 'Monitoring vitals'}
        {triage_context}
        
        MEDICATIONS & HISTORY:
        - {meds_context}
        - Historical Records / Extracted Documents:
        {records_context[:2500]}
        
        LIFESTYLE DATA:
        {lifestyle_context}
        
        TASK:
        1. Provide a comprehensive clinical readout and health advice.
           - DO NOT state "Historical patient records are empty" if records, vitals, triage entries, or prescriptions exist above.
           - Explain the clinical reasoning for the '{analysis_result['risk_level']}' risk level.
           - Highlight key vitals, risk factors, and medication context.
           - **STRICT FORMATTING RULES:**
             * Write in markdown bullet points. NO LONG UNFORMATTED PARAGRAPHS.
             * Use **Markdown Headings** (###) for sections (e.g. ### CLINICAL ASSESSMENT, ### RISK FACTORS, ### STABILIZATION & ADVICE).
             * Use **Bold** for key extracted clinical terms.
        2. Provide 3 specific, actionable health tips.
        3. Provide 1 relevant follow-up question.
        
        Output purely in JSON format:
        {{
            "analysis_text": "Markdown formatted advice here...",
            "tips": ["Tip 1", "Tip 2", "Tip 3"],
            "follow_up_topic": "Follow-up question for the patient",
            "extracted_vitals": {{
                "bp": "Found BP", "sugar": "Found Sugar", "heart_rate": "Found HR",
                "weight": "Found Weight", "age": "Found Age", "blood_group": "Found Blood Group"
            }}
        }}
        """

        try:
            print("🤖 Sending comprehensive prompt to Gemini...")
            gemini_response = await safe_generate_content(
                contents=prompt,
                task_type="text_fast"
            )
            text_resp = gemini_response.text.replace("```json", "").replace("```", "").strip()
            import json
            ai_insights = json.loads(text_resp)
            
            gemini_vitals = ai_insights.get("extracted_vitals", {})
            def update_if_missing(key, val):
                current = analysis_result['vitals_detected'].get(key)
                if (current is None or current == "null" or current == "") and val and val != "null":
                    analysis_result['vitals_detected'][key] = val
                    
            update_if_missing('bp', gemini_vitals.get('bp'))
            update_if_missing('sugar', gemini_vitals.get('sugar'))
            update_if_missing('heart_rate', gemini_vitals.get('heart_rate'))
            update_if_missing('weight', gemini_vitals.get('weight'))
            update_if_missing('age', gemini_vitals.get('age'))
            update_if_missing('blood_group', gemini_vitals.get('blood_group'))

        except Exception as e:
            print(f"⚠️ Gemini Analysis Fallback Triggered: {e}")
            ai_insights = {
                "analysis_text": f"### Clinical Assessment Summary\n* The patient is currently evaluated at a **{analysis_result['risk_level']}** risk tier.\n* Key monitored vitals: **{vitals_str or 'Vitals under review'}**.\n* Continuous medical monitoring and adherence to prescribed medications are recommended.",
                "tips": ["Log daily vitals regularly", "Maintain hydration and medication schedule", "Consult your physician for routine evaluation"],
                "follow_up_topic": "Would you like to review your historical trends?"
            }

        return {
            "success": True,
            "prediction": analysis_result,
            "detailed_analysis": ai_insights["analysis_text"],
            "tips": ai_insights["tips"],
            "follow_up_prompt": ai_insights["follow_up_topic"],
            "is_emergency": triage_priority in ["RED", "ORANGE", "YELLOW"]
        }

    except Exception as e:
        import traceback
        print("❌ CRITICAL Health Analysis Error:")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/pharmacy/refill-alerts/{patient_id}")
async def get_refill_alerts(patient_id: str):
    """Fetch proactive refill alerts for a patient."""
    alerts = await pharmacy_service.get_refill_candidates(patient_id)
    return {"success": True, "alerts": alerts}

# ==========================================
# MULTI-AGENT ORCHESTRATOR ENDPOINT
# ==========================================
from agents.orchestrator_agent import OrchestratorAgent

_orchestrator = OrchestratorAgent()

class AgentChatRequest(BaseModel):
    message: str
    user_id: str          # auth.uid() of the logged-in patient (enforces data isolation)
    language: str = "en"
    use_voice: bool = False

@app.post("/agent/chat")
async def agent_chat(request: AgentChatRequest):
    """
    Multi-agent orchestrated chat endpoint.
    The OrchestratorAgent decides which specialist sub-agents to call,
    enforcing that all data access is scoped to request.user_id.
    """
    try:
        print(f"🧠 Orchestrator query from user {request.user_id}: {request.message}")
        result = await _orchestrator.run(
            message=request.message,
            user_id=request.user_id,
            language=request.language,
        )

        # Optional voice synthesis on the final response
        audio_data_b64 = None
        if request.use_voice and result.get("response"):
            try:
                audio_bytes = await voice_service.synthesize_empathic(result["response"], request.language)
                if audio_bytes:
                    import base64
                    audio_data_b64 = base64.b64encode(audio_bytes).decode("utf-8")
            except Exception as ve:
                print(f"⚠️ Agent voice synthesis failed: {ve}")

        return {
            "success": result["success"],
            "response": result["response"],
            "agents_used": result.get("agents_used", []),
            "steps": result.get("steps", []),
            "audio_data": audio_data_b64,
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"❌ Agent Chat Error: {e}")
        return {
            "success": False,
            "response": "I'm having trouble coordinating my agents right now. Please try again.",
            "agents_used": [],
            "steps": [],
            "error": str(e),
        }

# ==========================================
# Pharmacist Agent UI (Superuser access API)
# ==========================================

@app.post("/pharmacist/ai-query", response_model=ChatResponse)
async def pharmacist_ai_query(req: PharmacistAIRequest):
    """
    Superuser endpoint powered by the multi-agent PharmacistOrchestrator.
    """
    try:
        from agents.pharmacist_orchestrator import PharmacistOrchestratorAgent as _PharmOrchestratorAgent
        if not hasattr(pharmacist_ai_query, "_orchestrator"):
            pharmacist_ai_query._orchestrator = _PharmOrchestratorAgent()

        print(f"💊 Pharmacist Query (multi-agent): {req.message}")

        # Dispatch exactly like the patient chat path
        result = await pharmacist_ai_query._orchestrator.run(
            message=req.message,
            language=req.language,
        )

        ai_text = result.get("response", "I could not compute an answer.")

        # Audio Generation (If requested)
        audio_data = None
        if req.use_voice and ai_text:
            # Clean markdown for TTS
            clean_tts = ai_text.replace('*', '').replace('#', '').strip()
            audio_bytes = await voice_service.synthesize_empathic(clean_tts, req.language)
            if audio_bytes:
                import base64
                audio_data = base64.b64encode(audio_bytes).decode('utf-8')

        return ChatResponse(
            success=True,
            response=ai_text,
            audio_data=audio_data
        )

    except Exception as e:
        print(f"Pharmacist AI Agent Error: {e}")
        import traceback
        traceback.print_exc()
        error_msg = str(e)
        fallbacks = {
            "hi": "मुझे अभी आपके फार्मेसी रिकॉर्ड्स में परेशानी हो रही है। कृपया थोड़ी देर बाद फिर से प्रयास करें।",
            "mr": "मला आता तुमच्या फार्मसी रेकॉर्डमध्ये अडचण येत आहे. कृपया थोड्या वेळाने पुन्हा प्रयत्न करा.",
            "en": "I'm having trouble retrieving the pharmacist data. Please try again.",
        }
        quota_fallbacks = {
            "hi": "मुझे अभी बहुत सारे अनुरोध मिल रहे हैं। कृपया एक पल प्रतीक्षा करें और पुन: प्रयास करें।",
            "mr": "मला सध्या खूप विनंत्या येत आहेत. कृपया क्षणभर थांबा आणि पुन्हा प्रयत्न करा.",
            "en": "I'm currently receiving too many requests. Please wait a moment and try again.",
        }
        lang = getattr(req, "language", "en")
        if "429" in error_msg or "quota" in error_msg.lower() or "RESOURCE_EXHAUSTED" in error_msg:
            return ChatResponse(success=False, response=quota_fallbacks.get(lang, quota_fallbacks["en"]), error=error_msg)
        return ChatResponse(success=False, response=fallbacks.get(lang, fallbacks["en"]), error=error_msg)


@app.get("/patients")
async def get_patients():
    """
    Fetch all patients securely for the Hospital Triage Admin portal.
    Uses the service role key to bypass RLS on the patients table.
    """
    try:
        from supabase import create_client
        _supabase_url = os.getenv("VITE_SUPABASE_URL") or os.getenv("SUPABASE_URL")
        _supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        if not _supabase_url or not _supabase_key:
            raise HTTPException(status_code=500, detail="Supabase credentials not configured")
        _client = create_client(_supabase_url, _supabase_key)
        response = _client.table("patients").select("id, full_name").order("full_name").execute()
        return response.data
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error fetching patients: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to load patients list: {str(e)}")

@app.post("/triage/analyze")
async def analyze_triage(request: TriageAnalyzeRequest):
    """
    AI-driven Triage Assessment Endpoint.
    1. Uses a custom trained XGBoost model to evaluate Vitals and determine Priority (and Confidence).
    2. Uses Gemini 2.5 Flash to synthesize the ML Priority and Symptoms to generate the `clinical_reasoning` text.
    """
    try:
        import json
        
        # Step 1: Run local XGBoost Model on Vitals
        ml_priority_level, ml_confidence_score = predict_priority(request.vitals)
        
        # Step 2: Fetch patient's past medical records if patient_id is provided
        medical_history_context = request.history or "No prior history available."
        if request.patient_id:
            try:
                sb = _get_sb()
                records_resp = sb.table("records").select("title, record_type, record_date, extracted_text") \
                    .eq("patient_id", request.patient_id) \
                    .not_.is_("extracted_text", "null") \
                    .order("record_date", desc=True) \
                    .limit(10) \
                    .execute()
                
                if records_resp.data:
                    history_parts = []
                    for rec in records_resp.data:
                        entry = f"[{rec.get('record_type', 'Unknown')} - {rec.get('record_date', 'N/A')}] {rec.get('title', '')}: {rec.get('extracted_text', '')}"
                        history_parts.append(entry)
                    medical_history_context = "\n".join(history_parts)
                    print(f"📋 Loaded {len(records_resp.data)} past records for patient {request.patient_id}")
            except Exception as hist_err:
                print(f"⚠️ Could not fetch patient history: {hist_err}")
        
        # Step 3: Have Gemini write the Clinical Reasoning explanation
        
        prompt = f"""
        You are an expert emergency room triage AI assistant.
        The Machine Learning model has classified this patient as priority level: {ml_priority_level} (Confidence: {ml_confidence_score}%).
        
        Patient data:
        - Vitals: {json.dumps(request.vitals)}
        - Symptoms: {request.symptoms}
        
        PATIENT'S MEDICAL HISTORY FROM PAST RECORDS:
        {medical_history_context}
        
        Your task is ONLY to write a 1-3 sentence `clinical_reasoning` explaining *why* this classification makes sense medically.
        Reference the specific vitals and symptoms causing concern. If the patient has relevant past records (e.g., chronic conditions, allergies, past surgeries, recurring issues), factor those into your reasoning — a patient with a cardiac history presenting with chest pain is more urgent than one without.
        
        Return exactly a JSON object with this schema:
        {{
            "priority_level": "{ml_priority_level}",
            "confidence_score": {ml_confidence_score},
            "clinical_reasoning": "A concise 1-3 sentence medical justification for the doctor, referencing patient history if available."
        }}
        """
        
        response = await safe_generate_content(
            contents=prompt,
            task_type="text_fast",
            config=types.GenerateContentConfig(response_mime_type="application/json")
        )
        
        if not response.text:
            raise HTTPException(status_code=500, detail="No response from Gemini API")
            
        result = json.loads(response.text)
        
        # Ensure the ML priority is absolutely untouched, even if Gemini tries to alter it in the JSON string
        result["priority_level"] = ml_priority_level
        result["confidence_score"] = ml_confidence_score
        
        return result
        
    except Exception as e:
        print(f"Triage Analyze Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ==========================================
# Startup/Shutdown Events & Background Jobs
# ==========================================
import asyncio
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from supabase import create_client

async def email_polling_task():
    print("📧 Starting Email Polling Service for Pharmacist Alerts...")
    smtp_server = os.getenv("SMTP_SERVER", "smtp.gmail.com")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER", "")
    smtp_password = os.getenv("SMTP_APP_PASSWORD", "")
    pharmacist_email = os.getenv("PHARMACIST_EMAIL", smtp_user)
    
    supa = create_client(
        os.getenv("VITE_SUPABASE_URL"),
        os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    )

    def _poll_and_send():
        res = supa.table("notification_logs").select("*").eq("status", "pending").eq("channel", "email").execute()
        if res.data:
            for notif in res.data:
                payload = notif.get("payload", {})
                med_name = payload.get("medicine_name", "Unknown")
                stock = payload.get("current_stock", 0)
                threshold = payload.get("threshold", 10)
                
                if smtp_password and smtp_user:
                    try:
                        msg = MIMEMultipart()
                        msg['From'] = smtp_user
                        msg['To'] = pharmacist_email
                        msg['Subject'] = f"🚨 URGENT: Low Stock Alert - {med_name}"
                        
                        body = f"Hello Pharmacist,\n\nOur system detected critically low inventory for {med_name}.\n\nCurrent Stock: {stock}\nReorder Threshold: {threshold}\n\nPlease restock immediately.\n\n- MyHealthChain AI Agent"
                        msg.attach(MIMEText(body, 'plain'))
                        
                        server = smtplib.SMTP(smtp_server, smtp_port, timeout=10)
                        server.starttls()
                        server.login(smtp_user, smtp_password)
                        server.send_message(msg)
                        server.quit()
                        print(f"✅ Sent email alert for {med_name} to {pharmacist_email}")
                    except Exception as e:
                        print(f"❌ Failed to send email for {notif['id']}: {e}")
                else:
                    print(f"⚠️ SMTP credentials missing. Simulated Email Sent for {med_name} to pharmacist.")

                supa.table("notification_logs").update({"status": "sent"}).eq("id", notif["id"]).execute()

    while True:
        try:
            await asyncio.to_thread(_poll_and_send)
        except Exception as e:
             pass
             
        await asyncio.sleep(15)

async def auto_snapshot_task():
    from resource_load import get_snapshot, _get_sb
    while True:
        await asyncio.sleep(900)
        try:
            sb = _get_sb()
            res = sb.table("hospital_beds").select("hospital_id").execute()
            h_ids = list(set([r["hospital_id"] for r in (res.data or [])]))
            for h in h_ids:
                await get_snapshot(h)
        except Exception as e:
            print(f"Auto-snapshot failed: {e}")

# ==========================================
# DOCTOR ASSIGNMENT WHATSAPP FLOW
# ==========================================

class AssignmentResponse(BaseModel):
    assignment_id: str
    status: str  # 'accepted' or 'rejected'

@app.post("/doctor/assignment/respond")
async def respond_to_assignment(req: AssignmentResponse):
    """
    Callback endpoint for the WhatsApp Gateway.
    Updates the status of a doctor assignment.
    """
    from resource_load import _get_sb
    sb = _get_sb()
    
    # 1. Fetch current assignment to check if it's still pending
    # This provides Duplicate Response Protection
    current_res = sb.table("doctor_assignments").select("status, doctor_id, ward, shift").eq("id", req.assignment_id).execute()
    
    if not current_res.data:
        raise HTTPException(status_code=404, detail="Assignment not found")
    
    current = current_res.data[0]
    if current["status"] != "pending":
        # Already processed (accepted/rejected/no_response)
        return {"status": "ignored", "message": f"Assignment already {current['status']}"}

    # 2. Update status and timestamp
    new_status = req.status.lower()
    if new_status not in ['accepted', 'rejected']:
        raise HTTPException(status_code=400, detail="Invalid status")

    update_res = sb.table("doctor_assignments").update({
        "status": new_status,
        "responded_at": datetime.now(timezone.utc).isoformat()
    }).eq("id", req.assignment_id).execute()

    # 3. Log to audit_logs for traceability
    try:
        sb.table("audit_logs").insert({
            "action": f"DOCTOR_ASSIGNMENT_{new_status.upper()}",
            "details": f"Doctor {current['doctor_id']} responded {new_status} to {current['ward']} ({current['shift']})",
            "metadata": {"assignment_id": req.assignment_id}
        }).execute()
    except Exception as ae:
        print(f"⚠️ Audit log failed: {ae}")

    return {"status": "success", "new_status": new_status}

@app.get("/doctor/verify-phone")
async def verify_doctor_phone(phone: str):
    """
    Verification endpoint for the WhatsApp Gateway.
    Checks if a phone number belongs to a registered doctor.
    """
    from resource_load import _get_sb
    sb = _get_sb()
    
    clean_p = phone.strip()
    digits = "".join(filter(str.isdigit, clean_p))
    candidates = list(dict.fromkeys([
        clean_p,
        clean_p.lstrip("+"),
        f"+{clean_p.lstrip('+')}",
        digits,
        f"+{digits}"
    ]))
    
    res = sb.table("profiles").select("id").in_("phone", candidates).execute()
    
    if not res.data:
        return {"authorized": False}
    
    profile_ids = [p["id"] for p in res.data]
    
    # Verify this profile belongs to a doctor
    doc_res = sb.table("doctors").select("id").in_("user_id", profile_ids).execute()
    
    return {"authorized": len(doc_res.data) > 0}



class WhatsAppWebhookRequest(BaseModel):
    phone: str
    message: str

@app.post("/whatsapp-webhook")
async def whatsapp_webhook(req: WhatsAppWebhookRequest):
    """
    Conversational Webhook for WhatsApp.
    Uses OrchestratorAgent to handle messages from verified doctors.
    """
    from resource_load import _get_sb
    sb = _get_sb()
    
    # 1. Resolve phone to user_id (Priority to Doctor profiles)
    clean_p = req.phone.strip()
    digits = "".join(filter(str.isdigit, clean_p))
    candidates = list(dict.fromkeys([
        clean_p,
        clean_p.lstrip("+"),
        f"+{clean_p.lstrip('+')}",
        digits,
        f"+{digits}"
    ]))
    
    res = sb.table("profiles").select("id, role").in_("phone", candidates).execute()
        
    if not res.data:
        return {"success": False, "response": "Unauthorized phone number."}
    
    # Prioritize the profile that is actually in the doctors table
    user_id = res.data[0]["id"]
    if len(res.data) > 1:
        profile_ids = [p["id"] for p in res.data]
        doc_lookup = sb.table("doctors").select("user_id").in_("user_id", profile_ids).execute()
        if doc_lookup.data:
            user_id = doc_lookup.data[0]["user_id"]
            
    print(f"DEBUG: Selected profile_id {user_id} based on doctor table check.")
    
    # 1.5 Determine Role
    role = "patient"
    doc_res = sb.table("doctors").select("id").eq("user_id", user_id).execute()
    if doc_res.data:
        role = "doctor"
    
    # 2. Run Orchestrator
    try:
        print(f"🤖 WhatsApp AI Processing for {req.phone} (Role: {role}): {req.message}")
        result = await _orchestrator.run(
            message=req.message,
            user_id=user_id,
            language="en",
            role=role
        )
        
        return {
            "success": result["success"],
            "response": result["response"]
        }
    except Exception as e:
        print(f"❌ WhatsApp AI Error: {e}")
        return {"success": False, "response": "Sorry, I'm having trouble processing that right now."}


@app.on_event("startup")
async def startup_event():
    print("🚀 FastAPI Healthcare AI Server Started")
    print("📍 Server running on: http://localhost:8080")
    print("📖 API Docs available at: http://localhost:8080/docs")
    
    # Train the XGBoost triage model if it doesn't exist
    try:
        from ml_triage import train_triage_model
        # Run in a separate thread so it doesn't block startup event loop
        import asyncio
        await asyncio.to_thread(train_triage_model, force_retrain=False)
    except Exception as e:
        print(f"⚠️ Warning: Could not initialize ML Triage model on startup: {e}")
    
    if not os.getenv("ELEVENLABS_API_KEY"):
        print("⚠️ WARNING: ELEVENLABS_API_KEY is missing from .env. Voice synthesis will fail.")
    else:
        print("✅ ElevenLabs API Key detected.")
        
    asyncio.create_task(email_polling_task())
    asyncio.create_task(auto_snapshot_task())

@app.on_event("shutdown")
async def shutdown_event():
    print("👋 Server shutting down...")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )