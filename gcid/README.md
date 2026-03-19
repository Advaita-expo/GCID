# Global Conflict Intelligence Dashboard (GCID)

Lightweight Flask app showcasing conflicts, economy, risk and news.

Prerequisites
- Python 3.8+
- pip

Setup

1. Create and activate a virtual environment

```bash
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

2. (Optional) Set NewsAPI key to get live news

Windows PowerShell:
```powershell
$env:NEWSAPI_KEY = 'YOUR_KEY'
```

3. Run the app

```bash
python app.py
```

Open http://127.0.0.1:5000 in your browser.
