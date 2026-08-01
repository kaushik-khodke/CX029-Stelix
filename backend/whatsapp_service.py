import os
import httpx
import asyncio
from datetime import datetime

async def send_whatsapp_message(phone: str, message: str) -> tuple[bool, str]:
    """
    Generic helper to send a WhatsApp text message via the Node.js WhatsApp Gateway.
    Returns (success: bool, detail: str)
    """
    gateway_url = os.getenv("WHATSAPP_GATEWAY_URL", "http://localhost:3001")
    raw_phone = phone.strip() if phone and str(phone).strip() else "918806275531"
    clean_digits = "".join(filter(str.isdigit, raw_phone))
    target_phone = f"91{clean_digits}" if len(clean_digits) == 10 else clean_digits
    if not target_phone:
        target_phone = "918806275531"
    
    payload = {
        "phone": target_phone,
        "message": message
    }

    try:
        async with httpx.AsyncClient() as client:
            log_msg = f"SENDING: Generic WhatsApp message to {target_phone}...\n"
            with open("whatsapp_debug.log", "a") as f:
                f.write(f"{datetime.now()}: {log_msg}")
            
            response = await client.post(f"{gateway_url}/send-message", json=payload, timeout=10.0)
            
            res_log = f"Gateway Response: {response.status_code} - {response.text}\n"
            with open("whatsapp_debug.log", "a") as f:
                f.write(f"{datetime.now()}: {res_log}")
                
            if response.status_code == 200:
                print(f"✅ SUCCESS: WhatsApp message sent to {target_phone}")
                return True, "Message sent successfully!"
            else:
                try:
                    err_json = response.json()
                    err_msg = err_json.get("error", response.text)
                except Exception:
                    err_msg = response.text
                print(f"⚠️ WARNING: Gateway returned {response.status_code}: {err_msg}")
                return False, f"WhatsApp Gateway ({response.status_code}): {err_msg}"
    except Exception as e:
        err_log = f"ERROR: {str(e)}\n"
        with open("whatsapp_debug.log", "a") as f:
            f.write(f"{datetime.now()}: {err_log}")
        print(f"❌ FAILED to reach WhatsApp gateway: {e}")
        return False, f"Could not reach WhatsApp Gateway on {gateway_url}. Ensure gateway process is running."


async def send_whatsapp_assignment(phone: str, doctor_name: str, ward: str, shift: str, assignment_id: str):
    """
    Sends a formatted WhatsApp message via the Node.js gateway.
    Falls back to target doctor phone 9022434807 if phone is unrecorded.
    """
    gateway_url = os.getenv("WHATSAPP_GATEWAY_URL", "http://localhost:3001")
    raw_phone = phone.strip() if phone and str(phone).strip() else "919022434807"
    clean_digits = "".join(filter(str.isdigit, raw_phone))
    target_phone = f"91{clean_digits}" if len(clean_digits) == 10 else clean_digits
    if not target_phone:
        target_phone = "919022434807"
    
    message = (
        f"👨‍⚕️ Assignment Alert\n\n"
        f"Hi Dr. {doctor_name},\n\n"
        f"Ward: {ward}\n"
        f"Shift: {shift}\n\n"
        f"Reply:\n"
        f"YES → Accept\n"
        f"NO → Reject\n\n"
        f"ID: {assignment_id}"
    )

    payload = {
        "phone": target_phone,
        "message": message
    }

    try:
        async with httpx.AsyncClient() as client:
            log_msg = f"SENDING: WhatsApp assignment to {target_phone} for assignment {assignment_id}...\n"
            with open("whatsapp_debug.log", "a") as f:
                f.write(f"{datetime.now()}: {log_msg}")
            
            response = await client.post(f"{gateway_url}/send-message", json=payload, timeout=8.0)
            
            res_log = f"Gateway Response: {response.status_code} - {response.text}\n"
            with open("whatsapp_debug.log", "a") as f:
                f.write(f"{datetime.now()}: {res_log}")
                
            if response.status_code == 200:
                print(f"SUCCESS: WhatsApp sent to {target_phone}")
            else:
                print(f"WARNING: Gateway returned {response.status_code}: {response.text}")
    except Exception as e:
        err_log = f"ERROR: {str(e)}\n"
        with open("whatsapp_debug.log", "a") as f:
            f.write(f"{datetime.now()}: {err_log}")
        print(f"FAILED: Reach gateway: {e}")

