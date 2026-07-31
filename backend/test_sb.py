import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv('.env')

url = os.getenv("VITE_SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

print(f"URL: {url}")
print(f"Key: {key}")

try:
    supabase = create_client(url, key)
    print("Success: Client created")
    # Try a simple select to verify the key
    res = supabase.table("patients").select("id").limit(1).execute()
    print("Success: Query executed")
    print(res.data)
except Exception as e:
    print(f"Error: {e}")
