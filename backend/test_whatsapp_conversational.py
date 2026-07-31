import requests
import json

def test_conversational_whatsapp():
    url = "http://localhost:8000/whatsapp-webhook"
    
    # Mocking a doctor's conversational message
    # Phone number updated as per user request: 919022434807
    payload = {
        "phone": "919022434807",
        "message": "Alright, I will accept the Emergency Ward assignment."
    }
    
    print(f"Sending message: {payload['message']}")
    try:
        response = requests.post(url, json=payload)
        print(f"Status Code: {response.status_code}")
        print("AI Response:")
        print(json.dumps(response.json(), indent=2))
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_conversational_whatsapp()
