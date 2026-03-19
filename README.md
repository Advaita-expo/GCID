# GCID — Global Conflict Intelligence Dashboard

Real-time dashboard that aggregates news, conflict zones, maritime incidents and economic indicators to provide situational awareness and impact analysis.

Features
- Real-time updates via Socket.IO (news, conflicts, maritime, economy)
- Interactive world map (Leaflet) with clustered news and conflict markers
- Basic economy charts (Chart.js) and market summary
- Feed-based news ingestion with heuristic geocoding for article placement

Quick start (Windows)
1. Create and activate a Python virtual environment:

```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
```

2. Install dependencies:

```powershell
pip install -r gcid\requirements.txt
```

3. Run the app locally:

```powershell
# optional: set PORT
$env:PORT='5000'
.\venv\Scripts\python.exe gcid\app.py
```

Or run the helper batch (Windows):

```powershell
.\run_server.bat
```

Configuration & environment
- `NEWSAPI_KEY` (optional) — NewsAPI key if you prefer NewsAPI over RSS feeds
- `USE_FEEDS` (true/false) — prefer RSS/Atom feeds (default true)
- `PORT` — server port (default 5000)

Important files
- `gcid/app.py` — Flask + Flask-SocketIO server and background updater
- `gcid/services/api_service.py` — data fetchers, feeds and geocoding heuristics
- `gcid/static/js/main.js` — client code: map, charts, Socket.IO handlers
- `gcid/templates/` — HTML templates (dashboard, economy, news, etc.)

Deployment notes
- This app uses Flask-SocketIO and is tested with `eventlet`. Choose a host that supports long-lived sockets (Render, Fly.io, Railway, Heroku with websockets). A `Procfile` and small deployment guide can be added for your chosen provider.

Security & privacy
- News geocoding is heuristic-based (keyword gazetteer) — accuracy varies. For production, consider integrating an external geocoding/NLP service.
- The local CSS now avoids loading marker image assets from CDNs to prevent tracking-prevention warnings in some browsers.

Contributing
- Fork, create a feature branch, and open a pull request. Run checks locally and include notes for any external API keys required.

License
- MIT (you can change this as needed)
