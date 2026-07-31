import requests
import json

def trigger_shift_change():
    doc_id = "427cdcfe-504d-42b4-abdf-4f33f0e88621"  # Dr. Om
    url = f"http://localhost:8000/resource/doctors/{doc_id}"
    
    # Toggle shift to trigger the notification
    payload = {
        "shift_type": "Morning Shift",
        "ward_assigned": "Emergency Ward"
    }
    
    print(f"Triggering shift change for Dr. Om...")
    try:
        response = requests.patch(url, json=payload)
        print(f"Status: {response.status_code}")
        print(f"Response: {json.dumps(response.json(), indent=2)}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    trigger_shift_change()
