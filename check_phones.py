import codecs, json

with codecs.open('phones.json', 'r', 'utf-16le') as f:
    raw = f.read().lstrip(u'\ufeff')

data = json.loads(raw)
for p in data:
    print("phone_number_id:", p.get("phone_number_id"))
    print("phone_number:   ", p.get("phone_number"))
    print("agent_id:       ", p.get("agent_id") or "NOT LINKED")
    print("agent_name:     ", p.get("agent_name") or "NOT LINKED")
    print("---")
