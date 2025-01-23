from flask import Flask, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# Test Route
@app.route('/api/status', methods=['GET'])
def status():
    return jsonify({"status": "ok", "message": "Backend is running!"})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)