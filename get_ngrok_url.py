import urllib.request
import json
try:
    req = urllib.request.Request("http://127.0.0.1:4040/api/tunnels")
    with urllib.request.urlopen(req) as response:
        data = json.loads(response.read().decode('utf-8'))
        tunnels = data.get('tunnels', [])
        for t in tunnels:
            if t['public_url'].startswith('https'):
                print(t['public_url'])
except Exception as e:
    print("Error:", e)
