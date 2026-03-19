"""
API service helpers: fetch economy, news, and provide conflict zones.
Uses free public APIs where possible and falls back to mock data.
"""
import os
import requests
import logging
from datetime import datetime
import feedparser

logger = logging.getLogger(__name__)


def get_conflict_zones():
    # Hardcoded conflict zones (lat, lon, label, severity)
    # Added Pakistan and Afghanistan entries; Kashmir remains due to ongoing disputes
    base_zones = [
        {'name': 'Ukraine', 'lat': 50.4501, 'lon': 30.5234, 'severity': 8, 'note': 'High-intensity conflict following 2022 escalation.'},
        {'name': 'Syria', 'lat': 34.8021, 'lon': 38.9968, 'severity': 7, 'note': 'Long-running civil conflict with international actors.'},
        {'name': 'Yemen', 'lat': 15.5527, 'lon': 48.5164, 'severity': 6, 'note': 'Proxy conflict affecting Red Sea shipping.'},
        {'name': 'Kashmir', 'lat': 34.0837, 'lon': 74.7973, 'severity': 6, 'note': 'Disputed region between India and Pakistan; periodic escalations.'},
        {'name': 'Pakistan (border tensions)', 'lat': 30.3753, 'lon': 69.3451, 'severity': 5, 'note': 'Border security issues and spillover from neighboring conflicts.'},
        {'name': 'Afghanistan (insurgent activity)', 'lat': 33.9391, 'lon': 67.7100, 'severity': 6, 'note': 'Insurgent and militant activity affecting regional stability.'},
        {'name': 'Taiwan Strait', 'lat': 23.7540, 'lon': 121.0124, 'severity': 5, 'note': 'Tension around sovereignty and military posturing.'},
        {'name': 'Iran (regional tensions)', 'lat': 35.6892, 'lon': 51.3890, 'severity': 6, 'note': 'Regional influence operations and incidents in maritime zones.'},
        {'name': 'Venezuela (political unrest)', 'lat': 6.4238, 'lon': -66.5897, 'severity': 5, 'note': 'Political instability and sanctions affecting oil exports.'},
        {'name': 'Nigeria (regional instability)', 'lat': 9.0820, 'lon': 8.6753, 'severity': 5, 'note': 'Insurgent and militia activity affecting regional security.'},
        {'name': 'Ethiopia (regional conflict)', 'lat': 9.1450, 'lon': 40.4897, 'severity': 6, 'note': 'Internal conflict with cross-border implications.'},
        {'name': 'Sudan (civil unrest)', 'lat': 12.8628, 'lon': 30.2176, 'severity': 6, 'note': 'Civil unrest and humanitarian crisis.'},
        {'name': 'North Korea (missile activity)', 'lat': 39.0392, 'lon': 125.7625, 'severity': 7, 'note': 'Periodic missile tests and military posturing.'}
    ]

    # Augment base zones with recent news mentions (if available via NewsAPI)
    try:
        articles = get_news()
        if articles:
            # For each zone, count mentions in article titles and attach sample article links
            for z in base_zones:
                z['mentions'] = 0
                z['articles'] = []
                name = z['name'].split('(')[0].strip()  # normalize name for matching
                for a in articles:
                    title = (a.get('title') or '').lower()
                    source = (a.get('source') or '').lower() if a.get('source') else ''
                    if name.lower() in title or name.lower() in source:
                        z['mentions'] += 1
                        z['articles'].append({'title': a.get('title'), 'url': a.get('url'), 'source': a.get('source'), 'time': a.get('time')})
                # boost severity modestly based on mentions (cap +3)
                if z['mentions']:
                    z['severity'] = min(9, z['severity'] + min(3, z['mentions']))
    except Exception:
        # If news fetch fails, return base zones unchanged
        pass

    return base_zones


def get_maritime_data():
    """Return mock maritime lanes, choke points and vessel incidents."""
    # shipping lanes are simplified polylines
    lanes = [
        {
            'name': 'Asia-Europe (via Suez)',
            'coords': [[20,60],[15,50],[10,40],[30,30],[35,30],[40,25]]
        },
        {
            'name': 'Asia-Europe (via Cape of Good Hope)',
            'coords': [[10,80],[0,60],[-10,40],[-20,20]]
        },
        {
            'name': 'Asia-Mediterranean (Hormuz to Suez)',
            'coords': [[26,56],[25,54],[24,52],[23,50]]
        }
    ]

    choke_points = [
        {'name': 'Strait of Hormuz', 'lat': 26.556, 'lon': 56.25, 'importance': 10},
        {'name': 'Bab el-Mandeb', 'lat': 12.583, 'lon': 43.333, 'importance': 8},
        {'name': 'Suez Canal', 'lat': 30.0444, 'lon': 32.5577, 'importance': 9}
    ]

    incidents = [
        {'vessel':'MT Mock', 'lat':25.8, 'lon':56.0, 'type':'harassment', 'time':datetime.utcnow().isoformat()+'Z'}
    ]

    return {'lanes': lanes, 'choke_points': choke_points, 'incidents': incidents}


def get_economy_data():
    data = {}

    # GOLD and SILVER: metals.live (returns array of spot prices)
    try:
        r = requests.get('https://api.metals.live/v1/spot')
        r.raise_for_status()
        spots = r.json()
        # find gold and silver entries
        gold = next((s for s in spots if 'gold' in s.get('symbol', '').lower() or s.get('metal') == 'gold'), None)
        if not gold:
            # fallback parse
            for s in spots:
                if 'Gold' in str(s).title():
                    gold = s
                    break
        data['gold_price'] = gold.get('price') if gold and isinstance(gold, dict) and gold.get('price') else 1950
    except Exception:
        data['gold_price'] = 1950  # mock

    # OIL: no free universal API included — use mock or derive
    try:
        # We'll mock a plausible Brent crude price here
        data['oil_price'] = 88.5
    except Exception:
        data['oil_price'] = 88.5

    # USD/INR
    try:
        r = requests.get('https://api.exchangerate-api.com/v4/latest/USD', timeout=6)
        r.raise_for_status()
        rates = r.json().get('rates', {})
        data['usd_inr'] = rates.get('INR', 82.0)
    except Exception:
        data['usd_inr'] = 82.0

    # Bitcoin price as volatility indicator
    try:
        r = requests.get('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true', timeout=6)
        r.raise_for_status()
        j = r.json().get('bitcoin', {})
        data['bitcoin_price'] = j.get('usd', 40000)
        data['bitcoin_volatility'] = abs(j.get('usd_24h_change', 0))
    except Exception:
        data['bitcoin_price'] = 40000
        data['bitcoin_volatility'] = 2.0

    # generate simple mock time-series for charts (12 points)
    def series(base, amp=1):
        return [round(base + (amp * __import__('math').sin(i/2)), 2) for i in range(12)]

    data['series'] = {
        'labels': [f"-{11-i}h" for i in range(12)],
        'oil': series(data['oil_price'], 2),
        'gold': series(data['gold_price'], 5),
        'usd_inr': series(data['usd_inr'], 0.3),
        'bitcoin': series(data['bitcoin_price'], 800)
    }

    data['timestamp'] = datetime.utcnow().isoformat() + 'Z'
    return data


def get_news(api_key=None):
    # Returns a list of articles (title, source, urlToImage, publishedAt)
    if not api_key:
        api_key = os.environ.get('NEWSAPI_KEY')
    # If USE_FEEDS is set to true, prefer RSS/Atom feeds from popular publishers
    use_feeds = os.environ.get('USE_FEEDS', 'true').lower() in ('1', 'true', 'yes')

    def fetch_from_feeds():
        # curated list of popular news feeds (common world/regional feeds)
        feed_urls = [
            'http://feeds.bbci.co.uk/news/world/rss.xml',
            'https://www.aljazeera.com/xml/rss/all.xml',
            'http://feeds.reuters.com/Reuters/worldNews',
            'https://www.reuters.com/world/middle-east/rss.xml',
            'https://www.timesofisrael.com/feed/',
            'https://www.middleeasteye.net/rss.xml',
            'https://www.theguardian.com/world/rss',
            'https://www.firstpost.com/rss',
            'https://www.thehindu.com/news/international/feeder/default.rss'
        ]
        out = []
        for url in feed_urls:
            try:
                feed = feedparser.parse(url)
                source_title = (feed.feed.get('title') or url.split('/')[2]) if feed.feed else url
                for entry in feed.entries[:12]:
                    out.append({
                        'title': entry.get('title'),
                        'source': source_title,
                        'image': entry.get('media_content', [{}])[0].get('url') if entry.get('media_content') else None,
                        'time': entry.get('published') or entry.get('updated'),
                        'url': entry.get('link')
                    })
            except Exception as e:
                logger.debug('Feed parse failed for %s: %s', url, e)
        return out

    # Try feeds first when enabled
    if use_feeds:
        try:
            articles = fetch_from_feeds()
            if articles:
                return articles
        except Exception:
            logger.warning('Feed fetch failed, will try NewsAPI as fallback')

    # Fall back to NewsAPI when available
    if api_key:
        try:
            url = f'https://newsapi.org/v2/top-headlines?category=general&pageSize=20&apiKey={api_key}'
            r = requests.get(url, timeout=6)
            r.raise_for_status()
            articles = r.json().get('articles', [])
            out = []
            for a in articles:
                out.append({
                    'title': a.get('title'),
                    'source': a.get('source', {}).get('name'),
                    'image': a.get('urlToImage'),
                    'time': a.get('publishedAt'),
                    'url': a.get('url')
                })
            return out
        except Exception as e:
            logger.warning('NewsAPI fetch failed: %s', e)

    # fallback mock articles
    now = datetime.utcnow().isoformat() + 'Z'
    return [
        {'title': 'Geopolitical tensions rise near major choke points', 'source': 'Global News', 'image': None, 'time': now, 'url': '#'},
        {'title': 'Markets react to oil price movements', 'source': 'Finance Daily', 'image': None, 'time': now, 'url': '#'},
        {'title': 'Regional conflict escalations monitored by analysts', 'source': 'World Monitor', 'image': None, 'time': now, 'url': '#'},
    ]


def geocode_article(article):
    """Attempt to infer lat/lon for an article using keyword matching against a small gazetteer.
    This avoids external geocoding services and provides reasonable placement for major cities/countries.
    Returns (lat, lon) or None if no confident match.
    """
    if not article or not article.get('title'):
        return None
    title = (article.get('title') or '').lower()
    src = (article.get('source') or '').lower()

    # small gazetteer of keywords -> (lat, lon, label)
    GAZETTEER = {
        'riyadh': (24.7136, 46.6753, 'Riyadh, Saudi Arabia'),
        'jeddah': (21.4858, 39.1925, 'Jeddah, Saudi Arabia'),
        'dhahran': (26.2172, 50.1971, 'Dhahran, Saudi Arabia'),
        'abqaiq': (26.2203, 49.6386, 'Abqaiq, Saudi Arabia'),
        'mecca': (21.3891, 39.8579, 'Mecca, Saudi Arabia'),
        'madinah': (24.5247, 39.5692, 'Madinah, Saudi Arabia'),
        'dubai': (25.2048, 55.2708, 'Dubai, UAE'),
        'fujairah': (25.1270, 56.3265, 'Fujairah, UAE'),
        'abu dhabi': (24.4539, 54.3773, 'Abu Dhabi, UAE'),
        'sharjah': (25.3463, 55.4209, 'Sharjah, UAE'),
        'doha': (25.2854, 51.5310, 'Doha, Qatar'),
        'manama': (26.2235, 50.5876, 'Manama, Bahrain'),
        'kuwait': (29.3759, 47.9774, 'Kuwait City, Kuwait'),
        'basra': (30.5085, 47.7835, 'Basra, Iraq'),
        'baghdad': (33.3152, 44.3661, 'Baghdad, Iraq'),
        'sanaa': (15.3694, 44.1910, "Sana'a, Yemen"),
        'hodeida': (14.7988, 42.9669, 'Hodeida, Yemen'),
        'beirut': (33.8938, 35.5018, 'Beirut, Lebanon'),
        'tehran': (35.6892, 51.3890, 'Tehran, Iran'),
        'isfahan': (32.6546, 51.6675, 'Isfahan, Iran'),
        'moscow': (55.7558, 37.6176, 'Moscow, Russia'),
        'jerusalem': (31.7683, 35.2137, 'Jerusalem'),
        'tel aviv': (32.0853, 34.7818, 'Tel Aviv, Israel'),
        'gaza': (31.5, 34.47, 'Gaza Strip'),
        'saudi': (23.8859, 45.0792, 'Saudi Arabia'),
        'iran': (32.4279, 53.6880, 'Iran'),
        'uae': (23.4241, 53.8478, 'United Arab Emirates')
    }

    # check for explicit city keywords
    for kw, (lat, lon, label) in GAZETTEER.items():
        if kw in title or kw in src:
            return {'lat': lat, 'lon': lon, 'label': label}

    # check for country names
    country_map = {
        'saudi': (23.8859, 45.0792, 'Saudi Arabia'),
        'iran': (32.4279, 53.6880, 'Iran'),
        'israel': (31.0461, 34.8516, 'Israel'),
        'uae': (23.4241, 53.8478, 'United Arab Emirates')
    }
    for kw, (lat, lon, label) in country_map.items():
        if kw in title or kw in src:
            return {'lat': lat, 'lon': lon, 'label': label}

    # Heuristic: when the headline mentions attack types, prefer more specific nearby locations
    attack_terms = ('missile', 'strike', 'rocket', 'drone', 'attacks', 'attack', 'bomb')
    if any(t in title for t in attack_terms):
        # prefer explicit city keywords if present
        for kw in ('dubai', 'fujairah', 'abu dhabi', 'riyadh', 'jeddah', 'beirut', 'sanaa', 'basra', 'baghdad'):
            if kw in title or kw in src:
                lat, lon, label = GAZETTEER.get(kw, (None, None, None))
                if lat and lon:
                    return {'lat': lat, 'lon': lon, 'label': label}
        # otherwise map to country centroid when country is present
        if 'uae' in title or 'uae' in src or 'united arab emirates' in title:
            return {'lat': GAZETTEER['dubai'][0], 'lon': GAZETTEER['dubai'][1], 'label': 'UAE (approx)'}
        if 'saudi' in title or 'saudi' in src or 'saudi arabia' in title:
            return {'lat': GAZETTEER['riyadh'][0], 'lon': GAZETTEER['riyadh'][1], 'label': 'Saudi Arabia (approx)'}
        if 'iran' in title or 'iran' in src:
            return {'lat': GAZETTEER['tehran'][0], 'lon': GAZETTEER['tehran'][1], 'label': 'Iran (approx)'}
        if 'israel' in title or 'israel' in src:
            return {'lat': GAZETTEER['tel aviv'][0], 'lon': GAZETTEER['tel aviv'][1], 'label': 'Israel (approx)'}
    return None


def get_news_geo(api_key=None):
    """Get news articles and attach inferred geolocation where possible.
    Returns list of articles with optional 'lat' and 'lon' keys when geocoded.
    """
    articles = get_news(api_key)
    out = []
    for a in articles:
        geo = geocode_article(a)
        item = dict(a)
        if geo:
            item['lat'] = geo['lat']
            item['lon'] = geo['lon']
            item['place'] = geo.get('label')
        out.append(item)
    return out
