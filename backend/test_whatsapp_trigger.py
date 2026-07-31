import asyncio
import os
from whatsapp_service import send_whatsapp_assignment
from dotenv import load_dotenv

async def test_trigger():
    # Load .env manually
    load_dotenv(".env")
    
    phone = "918806275531" 
    name = "Dr. Test"
    ward = "Emergency"
    shift = "Night Shift"
    aid = "test-id-123"
    
    print(f"Triggering manual test for {phone}...")
    await send_whatsapp_assignment(phone, name, ward, shift, aid)
    print("Test script finished. Check whatsapp_debug.log and your phone.")

if __name__ == "__main__":
    asyncio.run(test_trigger())
