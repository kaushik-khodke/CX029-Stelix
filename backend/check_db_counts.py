import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

url = os.getenv("VITE_SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
supabase = create_client(url, key)

tables = ["patients", "doctors", "orders", "medicines", "records", "consent_requests"]

print(f"Checking Supabase: {url}")
for table in tables:
    try:
        res = supabase.table(table).select("count", count="exact").limit(0).execute()
        print(f"Table '{table}': {res.count} rows")
    except Exception as e:
        print(f"Table '{table}': ERROR - {e}")
