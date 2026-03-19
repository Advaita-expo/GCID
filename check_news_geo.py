from gcid.services import api_service

print('Fetching geo-tagged articles...')
articles = api_service.get_news_geo()
print('Total articles:', len(articles))
for i,a in enumerate(articles[:50],1):
    title = a.get('title') or '<no title>'
    place = a.get('place') or 'N/A'
    lat = a.get('lat')
    lon = a.get('lon')
    url = a.get('url')
    print(f"{i}. {title} -> {place} {lat} {lon} {url}")
