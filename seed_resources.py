import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
load_dotenv('backend/.env')

url = os.getenv("VITE_SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not url or not key:
    print("Missing Supabase credentials in .env")
    exit(1)

sb = create_client(url, key)

print("Fetching hospital profiles...")
res = sb.table("profiles").select("id").eq("role", "hospital").execute()
hospitals = res.data or []

if not hospitals:
    print("No hospital profiles found. Creating a test hospital account...")
    import time
    unique_suffix = int(time.time())
    email = f"test_hospital_{unique_suffix}@myhealthchain.com"
    try:
        # Service role key allows admin creation
        user = sb.auth.admin.create_user({
            "email": email,
            "password": "testinghospital123",
            "email_confirm": True
        })
        hid = user.user.id
        # Also ensure profile exists
        sb.table("profiles").upsert({"id": hid, "role": "hospital", "full_name": "General Hospital"}).execute()
        hospitals = [{"id": hid}]
        print(f"Created test hospital account: email '{email}', password 'testinghospital123'")
    except Exception as e:
        print(f"Failed to create hospital account automatically: {e}")
        print("Please sign up as a hospital in the frontend and run this script again.")
        exit(1)

print(f"Found {len(hospitals)} hospital(s). Seeding beds and staff...")

wards = ['ICU', 'EMERGENCY', 'OBSERVATION', 'GENERAL']
roles = ['doctor', 'nurse', 'paramedic', 'specialist']

beds_to_insert = []
staff_to_insert = []

for h in hospitals:
    hid = h["id"]
    
    # Beds
    for w in wards:
        num_beds = 5 if w in ['ICU', 'EMERGENCY'] else 20
        for i in range(1, num_beds + 1):
            beds_to_insert.append({
                "hospital_id": hid,
                "ward_type": w,
                "bed_number": f"{w[0]}-{i:02d}",
                "status": "available"
            })
            
    # Staff
    staff_to_insert.extend([
        {"hospital_id": hid, "name": "Dr. Sarah Jenkins", "role": "doctor", "shift_status": "on_duty", "ward_assigned": "EMERGENCY"},
        {"hospital_id": hid, "name": "Dr. Mark R.", "role": "doctor", "shift_status": "on_call", "ward_assigned": None},
        {"hospital_id": hid, "name": "Nurse Kelly", "role": "nurse", "shift_status": "on_duty", "ward_assigned": "ICU"},
        {"hospital_id": hid, "name": "Nurse Tom", "role": "nurse", "shift_status": "off_duty", "ward_assigned": None},
        {"hospital_id": hid, "name": "Paramedic Joe", "role": "paramedic", "shift_status": "on_call", "ward_assigned": None},
        {"hospital_id": hid, "name": "Dr. Lee (Cardio)", "role": "specialist", "shift_status": "on_duty", "ward_assigned": "GENERAL"},
    ])

print("Inserting beds...")
for i in range(0, len(beds_to_insert), 50):
    sb.table("hospital_beds").insert(beds_to_insert[i:i+50]).execute()
    
print("Inserting staff...")
for i in range(0, len(staff_to_insert), 50):
    sb.table("hospital_staff").insert(staff_to_insert[i:i+50]).execute()
    
print("Done seeding data!")
