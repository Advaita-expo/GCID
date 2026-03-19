// Main frontend logic: fetching APIs, updating UI, map and charts
const API = {
  economy: '/api/economy',
  news: '/api/news',
  risk: '/api/risk'
};

let autoRefresh = 30000; // 30s
const socket = (typeof io !== 'undefined') ? io() : null;

// Prevent relying on external marker images (tracking prevention may block CDN image storage).
// Use transparent data URIs for default icon assets so Leaflet won't request external files for icons.
try{
  if(typeof L !== 'undefined' && L.Icon && L.Icon.Default && L.Icon.Default.mergeOptions){
    const TRANSPARENT = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
    L.Icon.Default.mergeOptions({
      iconUrl: TRANSPARENT,
      iconRetinaUrl: TRANSPARENT,
      shadowUrl: TRANSPARENT
    });
  }
}catch(e){/* ignore if Leaflet not loaded yet */}

function startClock() {
  const el = document.getElementById('clock');
  function tick() {
    const now = new Date();
    el.textContent = now.toISOString().replace('T',' ').slice(0,19);
  }
  tick();
  setInterval(tick, 1000);
}

async function fetchEconomy(){
  try{
    const res = await fetch(API.economy);
    const j = await res.json();
    if(!j.ok) throw new Error(j.error||'failed');
    return j.data;
  }catch(e){
    console.error('economy fetch failed',e);
    setDebug('economy fetch error: '+(e.message||e));
    return null;
  }
}

async function updateEconomyUI(){
  const data = await fetchEconomy();
  if(!data){ setDebug('updateEconomyUI: no data'); return; }
  setDebug('economy data received');
  applyEconomyData(data);
}

// apply economy payload to DOM and charts
function applyEconomyData(data){
  try{
    if(!data) return;
    const oilEl = document.getElementById('oil-price');
    const goldEl = document.getElementById('gold-price');
    const usdEl = document.getElementById('usd-inr');
    const btcEl = document.getElementById('btc-price');
    const updEl = document.getElementById('econ-updated');
    if(oilEl) oilEl.textContent = data.oil_price ? `$${data.oil_price}` : '—';
    if(goldEl) goldEl.textContent = data.gold_price ? `$${data.gold_price}` : '—';
    if(usdEl) usdEl.textContent = data.usd_inr ? data.usd_inr : '—';
    if(btcEl) btcEl.textContent = data.bitcoin_price ? `$${Math.round(data.bitcoin_price)}` : '—';
    if(updEl) updEl.textContent = data.timestamp || '';

    // update charts if present
    const charts = window._charts || {};
    const series = data.series || {};
    if(charts.oil && series.oil){ charts.oil.data.labels = series.labels || charts.oil.data.labels; charts.oil.data.datasets[0].data = series.oil; charts.oil.update(); }
    if(charts.gold && series.gold){ charts.gold.data.labels = series.labels || charts.gold.data.labels; charts.gold.data.datasets[0].data = series.gold; charts.gold.update(); }
    if(charts.usd && series.usd_inr){ charts.usd.data.labels = series.labels || charts.usd.data.labels; charts.usd.data.datasets[0].data = series.usd_inr; charts.usd.update(); }
    if(charts.btc && series.bitcoin){ charts.btc.data.labels = series.labels || charts.btc.data.labels; charts.btc.data.datasets[0].data = series.bitcoin; charts.btc.update(); }
    // always update market summary too
    try{ updateMarketSummary(data); }catch(e){/*ignore*/}
  }catch(e){ console.warn('applyEconomyData failed', e) }
}

// ensure market summary is updated even if charts fail
function updateMarketSummary(data){
  try{
    const ms = document.getElementById('market-summary');
    if(!ms) return;
    ms.innerHTML = `
      <div>Oil: <strong>$${data.oil_price}</strong></div>
      <div>Gold: <strong>$${data.gold_price}</strong></div>
      <div>USD/INR: <strong>${data.usd_inr}</strong></div>
      <div>BTC: <strong>$${Math.round(data.bitcoin_price)}</strong></div>
    `;
  }catch(e){ console.warn('updateMarketSummary failed', e) }
}

// --- Realtime / Polling fallback ---
let _poller = null;
function startPolling(){
  if(_poller) return;
  setDebug('polling fallback started');
  // poll every autoRefresh ms
  _poller = setInterval(async ()=>{
    try{
      const econ = await fetchEconomy(); if(econ) { applyEconomyData(econ); updateMarketSummary(econ); }
      const cf = await fetch('/api/conflicts').then(r=>r.json()).catch(()=>null);
      if(cf && cf.ok) updateConflictLayer(cf.zones||[]);
      const mt = await fetch('/api/maritime').then(r=>r.json()).catch(()=>null);
      if(mt && mt.ok) updateMaritimeLayers(mt.data||{});
    }catch(e){ console.warn('polling error', e); }
  }, autoRefresh);
}

function stopPolling(){ if(_poller){ clearInterval(_poller); _poller = null; setDebug('polling stopped'); } }

function ensureRealtime(){
  if(typeof io === 'undefined'){
    setDebug('socket.io client missing — using polling');
    startPolling();
    return;
  }
  // connect and attach handlers
  try{
    const s = io();
    s.on('connect', ()=>{ setDebug('socket connected'); stopPolling(); });
    s.on('disconnect', ()=>{ setDebug('socket disconnected — fallback to polling'); startPolling(); });
    s.on('economy_update', (p)=>{ if(p && p.data){ applyEconomyData(p.data); updateMarketSummary(p.data); } });
    s.on('conflicts_update', (p)=>{ updateConflictLayer(p.zones||[]) });
    s.on('maritime_update', (p)=>{ updateMaritimeLayers(p.data||{}) });
    s.on('news_update', (p)=>{ renderNewsFromArray(p.articles||[]) });
  }catch(e){ console.warn('socket init failed', e); setDebug('socket init failed — polling'); startPolling(); }
}

// populate debug panel (visible on economy page)
function setDebug(msg){
  try{
    const el = document.getElementById('debug-info');
    if(!el) return;
    el.textContent = `Debug: ${msg}`;
  }catch(e){/* ignore */}
}

// initial debug checks
function runDebugChecks(){
  try{
    const hasChart = (typeof Chart !== 'undefined');
    const sock = socket ? 'connected' : 'socket missing';
    const oilExists = !!document.getElementById('oilChart');
    setDebug(`${hasChart ? 'Chart.js OK' : 'Chart.js missing'} • ${sock} • oilChart:${oilExists}`);
  }catch(e){console.warn('debug checks failed', e)}
}

async function fetchNews(){
  try{
    const res = await fetch(API.news);
    const j = await res.json();
    if(!j.ok) throw new Error(j.error||'failed');
    return j.articles;
  }catch(e){
    console.error('news fetch failed',e);
    return [];
  }
}

function initMap(){
  const map = L.map('map', {zoomControl:true}).setView([20,0],2);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  // expose map and layers globally so socket handlers can update them in real-time
  window._map = map;
  // prefer clustered groups for conflicts when available
  if(typeof L !== 'undefined' && L.markerClusterGroup){
    window._conflictLayer = L.markerClusterGroup({chunkedLoading:true});
  }else{
    window._conflictLayer = L.layerGroup();
  }
  window._maritimeLayer = L.layerGroup();
  window._incidentsLayer = L.layerGroup();
  // add to map
  window._conflictLayer.addTo(map);
  window._maritimeLayer.addTo(map);
  window._incidentsLayer.addTo(map);
  // news article layer (clustered)
  if(typeof L !== 'undefined' && L.markerClusterGroup){
    window._newsLayer = L.markerClusterGroup({chunkedLoading:true});
  }else{
    window._newsLayer = L.layerGroup();
  }
  window._newsLayer.addTo(map);

  fetch('/api/conflicts').then(r=>r.json()).then(j=>{
    const zones = (j.ok && j.zones) ? j.zones : [];
    updateConflictLayer(zones);
  }).catch(err=>{
    console.warn('conflicts fetch failed', err);
    if(document.getElementById('active-conflicts')) document.getElementById('active-conflicts').textContent = '—';
  });

  // fetch maritime data (lanes, choke points, incidents)
  fetch('/api/maritime').then(r=>r.json()).then(j=>{
    if(!j.ok) return;
    updateMaritimeLayers(j.data || {});
  }).catch(e=>{
    console.warn('maritime fetch failed', e);
  });

  // add layer control after data loaded (layers exposed on window)
  L.control.layers(null, {
    'Conflicts': window._conflictLayer,
    'Maritime Lanes & Choke Points': window._maritimeLayer,
    'Incidents': window._incidentsLayer
  }, {collapsed:false}).addTo(map);

  // small status control for a more professional map UI
  const StatusControl = L.Control.extend({
    options: { position: 'topright' },
    onAdd: function(){
      const el = L.DomUtil.create('div', 'map-status-control');
      el.style.padding = '6px 8px';
      el.style.background = 'rgba(0,0,0,0.45)';
      el.style.color = '#fff';
      el.style.fontSize = '12px';
      el.style.borderRadius = '6px';
      el.innerHTML = `<div style="font-weight:600">Map</div><div id="map-status-text" style="opacity:0.9;font-size:11px">Idle</div>`;
      return el;
    }
  });
  map.addControl(new StatusControl());
}

// helpers to update layers from real-time payloads
function updateConflictLayer(zones){
  try{
    const layer = window._conflictLayer;
    if(layer.clearLayers) layer.clearLayers(); else layer.eachLayer(l=>layer.removeLayer(l));
    (zones||[]).forEach(z=>{
      const color = z.severity>7? 'red' : (z.severity>5? 'orange' : 'purple');
      const marker = L.circleMarker([z.lat,z.lon], {radius:8+(z.severity||0)/2, color: color, fillOpacity:0.8, weight:1});
      let popup = `<div style="max-width:300px"><strong>${z.name}</strong><div style=\"font-size:12px;opacity:0.9\">Severity: ${z.severity || 'N/A'}</div><div style=\"margin-top:6px;font-size:12px;color:#ddd\">${z.note||''}</div>`;
      if(z.articles && z.articles.length){
        popup += '<hr/><div style="font-size:11px;color:#ccc">Recent coverage:</div><ul style="font-size:11px;color:#ccc">';
        z.articles.slice(0,3).forEach(a=>{ popup += `<li><a href="${a.url}" target="_blank">${a.source||''}: ${a.title}</a></li>` });
        popup += '</ul>';
      }
      popup += '</div>';
      marker.bindPopup(popup);
      if(layer.addLayer) layer.addLayer(marker); else marker.addTo(layer);
    });
    if(document.getElementById('active-conflicts')) document.getElementById('active-conflicts').textContent = (zones||[]).length || '—';
    const legendEl = document.getElementById('conflict-legend');
    if(legendEl){
      legendEl.innerHTML = (zones||[]).map(z=>`<div class="mb-2"><strong>${z.name}</strong> — <span class="text-xs text-gray-400">${z.note||'No details'}</span></div>`).join('');
    }
  }catch(e){console.warn('updateConflictLayer failed', e)}
}

function updateMaritimeLayers(data){
  try{
    const mLayer = window._maritimeLayer;
    const iLayer = window._incidentsLayer;
    if(mLayer.clearLayers) mLayer.clearLayers(); else mLayer.eachLayer(l=>mLayer.removeLayer(l));
    if(iLayer && iLayer.clearLayers) iLayer.clearLayers();
    (data.lanes||[]).forEach(lane=>{
      const latlngs = lane.coords.map(c=>[c[0], c[1]]);
      const pl = L.polyline(latlngs, {color:'#60a5fa', weight:2, opacity:0.6, dashArray:'6,8'}).bindPopup(`<strong>${lane.name}</strong>`);
      if(mLayer.addLayer) mLayer.addLayer(pl); else pl.addTo(mLayer);
    });
    (data.choke_points||[]).forEach(cp=>{
      const marker = L.circleMarker([cp.lat, cp.lon], {radius:8+(cp.importance||0)/2, color:'#ffcc00', fillOpacity:0.85}).bindPopup(`<strong>${cp.name}</strong><br/>Importance: ${cp.importance}`);
      if(mLayer.addLayer) mLayer.addLayer(marker); else marker.addTo(mLayer);
    });
    (data.incidents||[]).forEach(ii=>{
      const m = L.marker([ii.lat, ii.lon], {title:ii.vessel}).bindPopup(`<strong>Incident: ${ii.vessel}</strong><br/>${ii.type} • ${ii.time}`);
      if(iLayer && iLayer.addLayer) iLayer.addLayer(m); else m.addTo(window._incidentsLayer);
    });
  }catch(e){console.warn('updateMaritimeLayers failed', e)}
}

async function updateRisk(){
  try{
    const res = await fetch(API.risk);
    const j = await res.json();
    if(!j.ok) throw new Error(j.error||'failed');
    // simple notifications
    const el = document.getElementById('notifications');
    el.innerHTML = `<div>WW3 Risk: <strong class="neon-red">${j.score}</strong> — ${j.level}</div>`;
  }catch(e){console.error('risk fetch',e)}
}

function attachAutoRefresh(){
  setInterval(()=>{ updateEconomyUI(); updateRisk(); }, autoRefresh);
}

document.addEventListener('DOMContentLoaded', ()=>{
  startClock();
  if(document.getElementById('map')) initMap();
  updateEconomyUI();
  updateRisk();
  attachAutoRefresh();
  // attach socket debug handlers
  if(socket){
    try{
      socket.on('connect', ()=> setDebug('socket connected'));
      socket.on('connect_error', (err)=> setDebug('socket connect error'));
      socket.on('disconnect', ()=> setDebug('socket disconnected'));
    }catch(e){ console.warn('socket handlers failed', e) }
  }
  runDebugChecks();
  // start realtime (socket or polling)
  ensureRealtime();
  // page-specific initializers
  if(document.getElementById('oilChart')) initEconomyCharts();
  if(document.getElementById('indiaOilImportChart')) initIndiaCharts();
  if(document.getElementById('riskGauge')) initRiskGauge();
  if(document.getElementById('news-list')) renderNews();
  // socket handlers for real-time updates
  if(socket){
    socket.on('news_update', (payload)=>{
      if(document.getElementById('news-list')) renderNewsFromArray(payload.articles || []);
    });
    socket.on('conflicts_update', (payload)=>{
      updateConflictLayer(payload.zones || []);
    });
    socket.on('maritime_update', (payload)=>{
      updateMaritimeLayers(payload.data || {});
    });
    socket.on('economy_update', (payload)=>{
      applyEconomyData(payload.data || {});
    });
    socket.on('news_geo_update', (payload)=>{
      const arts = payload.articles || [];
      if(arts.length) updateNewsLayer(arts);
    });
  }
});

function renderNewsFromArray(articles){
  const list = document.getElementById('news-list');
  if(!list) return;
  list.innerHTML = '';
  (articles||[]).forEach(a=>{
    const card = document.createElement('div');
    card.className = 'glass-card p-4';
    // show source as citation, hide if missing
    const source = a.source? `<div class="text-sm text-gray-400">Source: ${a.source}</div>` : '';
    const time = a.time? `<div class="text-xs text-gray-400 mt-2">${a.time}</div>` : '';
    card.innerHTML = `
      ${source}
      <a href="${a.url}" target="_blank" class="block mt-2 text-md font-semibold text-white hover:underline">${a.title}</a>
      ${time}
    `;
    list.appendChild(card);
  });
}

function updateNewsLayer(articles){
  try{
    const layer = window._newsLayer;
    if(!layer) return;
    if(layer.clearLayers) layer.clearLayers(); else layer.eachLayer(l=>layer.removeLayer(l));
    (articles||[]).forEach(a=>{
      if(!a.lat || !a.lon) return;
      const title = a.title || '';
      const src = a.source || '';
      const time = a.time || '';
      const place = a.place || '';
      // build popup: show source/citation prominently; hide place if not present
      let popup = `<div style="max-width:320px;font-family:inherit;color:#111">`;
      popup += `<div style="font-size:13px;color:#6b7280;margin-bottom:6px">${src? `Source: <strong style=\"color:#111\">${src}</strong>` : ''}</div>`;
      popup += `<div style="font-weight:600;margin-bottom:6px">${title}</div>`;
      if(time) popup += `<div style="font-size:12px;color:#6b7280;margin-bottom:6px">${time}</div>`;
      if(place) popup += `<div style="font-size:12px;color:#6b7280;margin-bottom:6px">Location: ${place}</div>`;
      popup += `<hr style="margin:8px 0"/><div><a href="${a.url}" target="_blank">Read full article</a></div></div>`;
      // use circle markers to avoid using external marker image assets
      const m = L.circleMarker([a.lat, a.lon], {radius:6, color:'#ef4444', fillColor:'#fecaca', fillOpacity:0.9, weight:1});
      m.bindPopup(popup);
      if(layer.addLayer) layer.addLayer(m); else m.addTo(layer);
    });
    // update map status
    const st = document.getElementById('map-status-text'); if(st) st.textContent = `News: ${articles.filter(a=>a.lat&&a.lon).length} articles`;
  }catch(e){console.warn('updateNewsLayer failed', e)}
}

// --- Charts and page-specific UI ---
function initEconomyCharts(){
  const ctxOil = document.getElementById('oilChart').getContext('2d');
  const ctxGold = document.getElementById('goldChart').getContext('2d');
  const ctxForex = document.getElementById('forexChart').getContext('2d');
  const ctxBtc = document.getElementById('btcChart').getContext('2d');

  // placeholder labels/data
  const labels = Array.from({length:12}, (_,i)=>`${i+1}h`);
  window._charts = window._charts || {};
  window._charts.oil = new Chart(ctxOil, {type:'line', data:{labels:labels, datasets:[{label:'Brent (USD)', data:labels.map(()=>null), borderColor:'#f97316', backgroundColor:'rgba(249,115,22,0.08)', fill:true}]}, options:{responsive:true}});
  window._charts.gold = new Chart(ctxGold, {type:'line', data:{labels:labels, datasets:[{label:'Gold (USD)', data:labels.map(()=>null), borderColor:'#facc15', backgroundColor:'rgba(250,204,21,0.06)', fill:true}]}, options:{responsive:true}});
  window._charts.usd = new Chart(ctxForex, {type:'line', data:{labels:labels, datasets:[{label:'USD/INR', data:labels.map(()=>null), borderColor:'#60a5fa', backgroundColor:'rgba(96,165,250,0.06)', fill:true}]}, options:{responsive:true}});
  window._charts.btc = new Chart(ctxBtc, {type:'line', data:{labels:labels, datasets:[{label:'BTC (USD)', data:labels.map(()=>null), borderColor:'#a78bfa', backgroundColor:'rgba(167,139,250,0.06)', fill:true}]}, options:{responsive:true}});

  // populate with real data (if available)
  fetchEconomy().then(data=>{
    if(!data){
      console.warn('No economy data available for charts');
      const ms = document.getElementById('market-summary'); if(ms) ms.textContent = 'Economy data unavailable';
      return;
    }
    applyEconomyData(data);
    try{
      document.getElementById('market-summary').innerHTML = `
        <div>Oil: <strong>$${data.oil_price}</strong></div>
        <div>Gold: <strong>$${data.gold_price}</strong></div>
        <div>USD/INR: <strong>${data.usd_inr}</strong></div>
        <div>BTC: <strong>$${Math.round(data.bitcoin_price)}</strong></div>
      `;
    }catch(e){console.warn('market summary update failed',e)}
  }).catch(e=>{console.error('initEconomyCharts failed',e); const ms = document.getElementById('market-summary'); if(ms) ms.textContent='Data fetch error';});
}

function initIndiaCharts(){
  const ctx = document.getElementById('indiaOilImportChart').getContext('2d');
  const labels = ['Crude', 'Refined', 'Others'];
  const data = [72, 20, 8];
  new Chart(ctx, {type:'doughnut', data:{labels, datasets:[{data, backgroundColor:['#f97316','#f59e0b','#6b7280']}]} });
}

function initRiskGauge(){
  const ctx = document.getElementById('riskGauge').getContext('2d');
  // initial dummy
  const gauge = new Chart(ctx, {type:'doughnut', data:{labels:['Risk','Remaining'], datasets:[{data:[30,70], backgroundColor:['#ff6b6b','#0f1720'], hoverOffset:4}]}, options:{cutout:'70%', responsive:true, plugins:{legend:{display:false}}}});

  // update with real score
  fetch('/api/risk').then(r=>r.json()).then(j=>{
    if(j.ok){
      const v = j.score;
      gauge.data.datasets[0].data = [v, 100-v];
      gauge.update();
      document.getElementById('risk-score').textContent = v;
      document.getElementById('risk-level').textContent = j.level;
      const contrib = Object.entries(j.contributors||{}).map(([k,val])=>`<div>${k}: ${val}</div>`).join('');
      document.getElementById('risk-contrib').innerHTML = contrib;
    }
  }).catch(e=>console.error(e));
}

async function renderNews(){
  const list = document.getElementById('news-list');
  list.innerHTML = '<div class="col-span-3 skeleton p-6">Loading articles...</div>';
  const articles = await fetchNews();
  list.innerHTML = '';
  articles.forEach(a=>{
    const card = document.createElement('div');
    card.className = 'glass-card p-4';
    card.innerHTML = `
      <div class="text-sm text-gray-400">${a.source}</div>
      <a href="${a.url}" target="_blank" class="block mt-2 text-md font-semibold text-white hover:underline">${a.title}</a>
      <div class="text-xs text-gray-400 mt-2">${a.time}</div>
    `;
    list.appendChild(card);
  });
}
