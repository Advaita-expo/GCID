import requests

try:
    r = requests.get('http://127.0.0.1:5000/api/economy', timeout=5)
    print('status', r.status_code)
    print(r.text)
except Exception as e:
    print('error', e)
