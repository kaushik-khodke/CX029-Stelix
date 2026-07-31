import os
from google import genai
from dotenv import load_dotenv

load_dotenv()

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

model_name = "gemini-2.5-flash"
print(f"Checking if model '{model_name}' is available via google-genai (v2):")

found = False
for model in client.models.list():
    if model_name in model.name:
        print(f"✅ Found: {model.name}")
        found = True

if not found:
    print(f"❌ Model '{model_name}' not found. Check your API key or model name.")
