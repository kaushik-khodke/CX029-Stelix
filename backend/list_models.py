import os
from google import genai
from dotenv import load_dotenv

load_dotenv()

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

print("Listing available models via google-genai (v2):")
for model in client.models.list():
    print(f"- {model.name} (supports: {model.supported_actions})")
