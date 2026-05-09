from flask import Flask
from flask_cors import CORS
import os

def create_app():
    app = Flask(__name__)
    CORS(app, resources={r"/*": {"origins": os.getenv('ALLOWED_ORIGINS', '*').split(',')}})
    
    # Register blueprints
    from .routes.mappings import mappings_bp
    app.register_blueprint(mappings_bp)
    
    return app
