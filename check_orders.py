import os
import sys
from dotenv import load_dotenv
from supabase import create_client

load_dotenv('backend/.env')

url = os.getenv("VITE_SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

sb = create_client(url, key)

pt = sb.table('patients').select('id').eq('user_id', '11111111-1111-1111-1111-111111111111').maybe_single().execute()
print("pt is None?", pt is None)
if pt is not None:
    print(dir(pt))
    print("pt.data:", getattr(pt, 'data', 'Missing Data Attribute'))
try:
    standard_res = sb.table("orders")\
        .select("id, status, channel, created_at, finalized_at, order_items(id, qty, dosage_text, frequency_per_day, days_supply, medicines(id, name, strength, unit_type, price_rec, package_size))")\
        .eq("patient_id", internal_id)\
        .order("created_at", desc=True)\
        .limit(10)\
        .execute()
    import json
    print(json.dumps(standard_res.data, indent=2))
except Exception as e:
    print("Error:", e)

