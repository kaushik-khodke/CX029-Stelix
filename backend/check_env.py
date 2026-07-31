import os
from dotenv import load_dotenv

# Replicate main.py's loading logic
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))
load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

print(f"ELEVENLABS_API_KEY: {'[SET]' if os.getenv('ELEVENLABS_API_KEY') else '[MISSING]'}")
print(f"ELEVENLABS_AGENT_ID: {os.getenv('ELEVENLABS_AGENT_ID')}")
print(f"ELEVENLABS_PHONE_ID: {os.getenv('ELEVENLABS_PHONE_ID')}")
print(f"VITE_ELEVENLABS_AGENT_ID: {os.getenv('VITE_ELEVENLABS_AGENT_ID')}")
