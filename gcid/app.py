import eventlet
eventlet.monkey_patch()

from flask import Flask, render_template, jsonify
from services import api_service, risk_model
from flask_socketio import SocketIO
import os
from time import sleep

app = Flask(__name__, static_folder='static', template_folder='templates')
# Configure Redis message queue for Socket.IO when REDIS_URL is present
redis_url = os.environ.get('REDIS_URL')
if redis_url:
    app.logger.info('Using Redis message queue: %s', redis_url)
    socketio = SocketIO(app, cors_allowed_origins='*', async_mode='eventlet', message_queue=redis_url)
else:
    socketio = SocketIO(app, cors_allowed_origins='*', async_mode='eventlet')


@app.route('/')
def dashboard():
    return render_template('dashboard.html')


@app.route('/economy')
def economy():
    return render_template('economy.html')


@app.route('/india')
def india():
    return render_template('india.html')


@app.route('/risk')
def risk():
    return render_template('risk.html')


@app.route('/news')
def news():
    return render_template('news.html')


@app.route('/api/economy')
def api_economy():
    try:
        data = api_service.get_economy_data()
        return jsonify({'ok': True, 'data': data})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


@app.route('/api/conflicts')
def api_conflicts():
    try:
        zones = api_service.get_conflict_zones()
        return jsonify({'ok': True, 'zones': zones})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


@app.route('/api/maritime')
def api_maritime():
    try:
        data = api_service.get_maritime_data()
        return jsonify({'ok': True, 'data': data})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


@app.route('/api/news')
def api_news():
    try:
        api_key = os.environ.get('NEWSAPI_KEY')
        data = api_service.get_news(api_key)
        return jsonify({'ok': True, 'articles': data})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


@app.route('/api/risk')
def api_risk():
    try:
        econ = api_service.get_economy_data()
        active_conflicts = len(api_service.get_conflict_zones())
        nuclear_powers = 9
        oil_price = econ.get('oil_price', 80)
        volatility = econ.get('bitcoin_volatility', 2)

        score, level, contributors = risk_model.calculate_ww3_risk(active_conflicts, nuclear_powers, oil_price, volatility)
        return jsonify({'ok': True, 'score': score, 'level': level, 'contributors': contributors})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


if __name__ == '__main__':
    # start background task to poll external sources and emit real-time updates
    def background_updater():
        while True:
            try:
                econ = api_service.get_economy_data()
                socketio.emit('economy_update', {'data': econ})
            except Exception as e:
                app.logger.exception('background economy fetch failed')

                try:
                    api_key = os.environ.get('NEWSAPI_KEY')
                    articles = api_service.get_news(api_key)
                    socketio.emit('news_update', {'articles': articles})
                    # also emit geo-tagged news when available
                    try:
                        geo = api_service.get_news_geo(api_key)
                        socketio.emit('news_geo_update', {'articles': geo})
                    except Exception:
                        app.logger.exception('background news geo fetch failed')
                except Exception as e:
                    app.logger.exception('background news fetch failed')

            try:
                zones = api_service.get_conflict_zones()
                socketio.emit('conflicts_update', {'zones': zones})
            except Exception as e:
                app.logger.exception('background conflicts_fetch failed')

            try:
                maritime = api_service.get_maritime_data()
                socketio.emit('maritime_update', {'data': maritime})
            except Exception as e:
                app.logger.exception('background maritime fetch failed')

            sleep(30)

    socketio.start_background_task(background_updater)
    port = int(os.environ.get('PORT', '5000'))
    @socketio.on('connect')
    def handle_connect():
        try:
            # send a snapshot to the newly connected client
            econ = api_service.get_economy_data()
            socketio.emit('economy_update', {'data': econ})
        except Exception:
            app.logger.exception('failed to send economy snapshot on connect')
        try:
            zones = api_service.get_conflict_zones()
            socketio.emit('conflicts_update', {'zones': zones})
        except Exception:
            app.logger.exception('failed to send conflicts snapshot on connect')
        try:
            maritime = api_service.get_maritime_data()
            socketio.emit('maritime_update', {'data': maritime})
        except Exception:
            app.logger.exception('failed to send maritime snapshot on connect')
        try:
            # send geo-tagged news snapshot
            geo = api_service.get_news_geo()
            socketio.emit('news_geo_update', {'articles': geo})
        except Exception:
            app.logger.exception('failed to send news geo snapshot on connect')

    socketio.run(app, debug=True, host='0.0.0.0', port=port)
