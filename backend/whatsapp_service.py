import os
import httpx
import asyncio
from datetime import datetime

async def send_whatsapp_assignment(phone: str, doctor_name: str, ward: str, shift: str, assignment_id: str):
    """
    Sends a formatted WhatsApp message via the Node.js gateway.
    Non-blocking and fail-silent as per requirements.
    """
    gateway_url = os.getenv("WHATSAPP_GATEWAY_URL", "http://localhost:3001")
    
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
        "phone": phone,
        "message": message
    }

    try:
        async with httpx.AsyncClient() as client:
            log_msg = f"SENDING: WhatsApp to {phone} for assignment {assignment_id}...\n"
            with open("whatsapp_debug.log", "a") as f:
                f.write(f"{datetime.now()}: {log_msg}")
            
            response = await client.post(f"{gateway_url}/send-message", json=payload, timeout=5.0)
            
            res_log = f"Gateway Response: {response.status_code} - {response.text}\n"
            with open("whatsapp_debug.log", "a") as f:
                f.write(f"{datetime.now()}: {res_log}")
                
            if response.status_code == 200:
                print(f"SUCCESS: WhatsApp sent to {phone}")
            else:
                print(f"WARNING: Gateway returned {response.status_code}: {response.text}")
    except Exception as e:
        err_log = f"ERROR: {str(e)}\n"
        with open("whatsapp_debug.log", "a") as f:
            f.write(f"{datetime.now()}: {err_log}")
        print(f"FAILED: Reach gateway: {e}")
