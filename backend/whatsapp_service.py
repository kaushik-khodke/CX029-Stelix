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


async def send_whatsapp_report(phone: str, patient_name: str, risk_level: str, analysis_text: str, tips: list):
    """
    Sends a formatted medical report to the patient via WhatsApp.
    """
    gateway_url = os.getenv("WHATSAPP_GATEWAY_URL", "http://localhost:3001")
    
    risk_emoji = "🟢"
    if risk_level.lower() == "warning":
        risk_emoji = "🟡"
    elif risk_level.lower() == "critical":
        risk_emoji = "🔴"

    import re
    # Simple markdown cleaner/formatter for WhatsApp
    clean_text = analysis_text
    # Convert header markdown (e.g. ### Header) to whatsapp bold (*Header*)
    clean_text = re.sub(r'#+\s*(.*?)\n', r'*\1*\n', clean_text)
    # Convert **bold** to *bold*
    clean_text = re.sub(r'\*\*(.*?)\*\*', r'*\1*', clean_text)

    tips_formatted = ""
    if tips:
        tips_formatted = "\n\n💡 *Health Tips:*\n" + "\n".join([f"• {tip}" for tip in tips])
        
    message = (
        f"📋 *MyHealthChain AI Health Report*\n\n"
        f"Hi {patient_name},\n\n"
        f"Here is your AI Health Insight summary:\n\n"
        f"🩺 *Predictive Risk Tier:* {risk_emoji} *{risk_level}*\n\n"
        f"{clean_text}"
        f"{tips_formatted}\n\n"
        f"Please log in to the portal to view full charts and history."
    )

    payload = {
        "phone": phone,
        "message": message
    }

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(f"{gateway_url}/send-message", json=payload, timeout=8.0)
            if response.status_code == 200:
                print(f"SUCCESS: WhatsApp report sent to {phone}")
                return True
            else:
                print(f"WARNING: Gateway returned {response.status_code}: {response.text}")
                return False
    except Exception as e:
        print(f"FAILED: Reach gateway to send report: {e}")
        return False

