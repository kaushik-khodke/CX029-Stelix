import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

url = os.getenv("VITE_SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
sb = create_client(url, key)

PATIENT_ID = "4720f774-69c0-4485-9b88-6f14cf8c287f"

print(f"--- Checking Patient: {PATIENT_ID} ---")
p = sb.table("patients").select("*").eq("id", PATIENT_ID).maybe_single().execute()
if p.data:
    print(f"Patient ID found! UID: {p.data['user_id']}")
    PATIENT_DB_ID = p.data['id']
else:
    print(f"Not found as patient.id. Checking user_id...")
    p2 = sb.table("patients").select("*").eq("user_id", PATIENT_ID).maybe_single().execute()
    if p2.data:
        print(f"Patient found via user_id! DB ID: {p2.data['id']}")
        PATIENT_DB_ID = p2.data['id']
    else:
        print("Patient not found anywhere.")
        PATIENT_DB_ID = PATIENT_ID

print(f"\n--- Checking Triage Queue for patient_id: {PATIENT_DB_ID} ---")
t = sb.table("triage_queue").select("*").eq("patient_id", PATIENT_DB_ID).order("arrival_time", desc=True).execute()
print(f"Triage Entries ({len(t.data)}):")
for entry in t.data:
    print(f"  - Status: {entry['status']}, Priority: {entry['priority_level']}, Arrival: {entry['arrival_time']}, Vitals: {entry['vitals']}")

