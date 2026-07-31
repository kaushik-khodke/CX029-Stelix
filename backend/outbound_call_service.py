import os
import json
import requests

class OutboundCallService:
    def __init__(self):
        # The CALLING agent can be on a separate ElevenLabs account/key from the voice synthesis agent
        self.elevenlabs_api_key = (
            os.getenv("ELEVENLABS_CALL_API_KEY")   # separate calling account key (preferred)
            or os.getenv("ELEVENLABS_API_KEY")     # fallback to the main account key
        )
        self.elevenlabs_agent_id = (
            os.getenv("ELEVENLABS_CALL_AGENT_ID")   # separate calling agent ID (preferred)
            or os.getenv("VITE_ELEVENLABS_AGENT_ID")
            or os.getenv("ELEVENLABS_AGENT_ID")
        )
        self.elevenlabs_phone_id = os.getenv("VITE_ELEVENLABS_PHONE_ID") or os.getenv("ELEVENLABS_PHONE_ID")
        # We assume the user has attached a phone number to their agent.

    def initiate_call(self, to_number: str, patient_info: dict):
        """
        Initiates an outbound call using ElevenLabs directly, removing the need for developer-managed Twilio.
        """
        if not self.elevenlabs_api_key:
            raise ValueError("ELEVENLABS_API_KEY is missing from environment variables.")
        if not self.elevenlabs_agent_id:
            raise ValueError("ElevenLabs Agent ID is missing from environment variables.")
        if not self.elevenlabs_phone_id:
            raise ValueError("ElevenLabs Phone ID is missing from environment variables.")

        # Serialize patient context into a dictionary to pass as a dynamic variable to ElevenLabs
        try:
            context_str = json.dumps(patient_info)
        except Exception:
            context_str = str(patient_info)

        url = "https://api.elevenlabs.io/v1/convai/twilio/outbound-call"
        headers = {
            "xi-api-key": self.elevenlabs_api_key,
            "Content-Type": "application/json"
        }
        
        # Ensure it has exactly a + prefix. Simple formatting
        clean_number = to_number.strip()
        if not clean_number.startswith("+"):
            clean_number = "+" + clean_number.lstrip("0")
        
        data = {
            "agent_id": self.elevenlabs_agent_id,
            "agent_phone_number_id": self.elevenlabs_phone_id,
            "to_number": clean_number,
            "conversation_initiation_client_data": {
                "dynamic_variables": {
                    "patient_info": context_str
                }
            }
        }
        
        response = requests.post(url, headers=headers, json=data)
        
        if response.status_code != 200:
            raise Exception(f"Failed to place call via ElevenLabs: {response.text}")
            
        res_data = response.json()
        return res_data.get("conversation_id", "Direct-Call-Initiated")
