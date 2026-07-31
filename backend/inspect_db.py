import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

url = os.getenv("VITE_SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
sb = create_client(url, key)

print(f"Supabase: {url}\n")

# Check orders
try:
    res = sb.table("orders").select("*").limit(5).execute()
    print(f"Orders (count {len(res.data or [])}): {res.data}")
except Exception as e:
    print(f"Error orders: {e}")

# Check medicines
try:
    res = sb.table("medicines").select("*").limit(5).execute()
    print(f"Medicines (count {len(res.data or [])}): {res.data}")
except Exception as e:
    print(f"Error medicines: {e}")

# Check patients
try:
    res = sb.table("patients").select("*").limit(5).execute()
    print(f"Patients (count {len(res.data or [])}): {res.data}")
except Exception as e:
    print(f"Error patients: {e}")
