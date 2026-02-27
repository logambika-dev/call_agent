from decouple import Config, RepositoryEnv

from utils.timedelta import parse_timespan

import os
import logging

# Robustly find the .env file by searching upwards from this file's location
def find_env():
    current = os.path.abspath(__file__)
    # Go up from AISDR-AI/backend/config/main.py -> AISDR-AI/backend/config -> ...
    search_dir = os.path.dirname(current)
    while search_dir != "/":
        test_path = os.path.join(search_dir, ".env")
        if os.path.exists(test_path):
            return test_path
        # Also check one level up if we are in the AISDR-AI folder
        search_dir = os.path.dirname(search_dir)
    return None

env_path = find_env()
if not env_path:
    print("CRITICAL: .env file not found in any parent directory!")
else:
    print(f"Loading environment from: {env_path}")

config = Config(RepositoryEnv(env_path) if env_path else {})
CORS_ORIGIN = "http://localhost:8080"

# if os.getenv("ENVIRONMENT") == "STAGE":
#     config = Config(RepositoryEnv("stage.env"))
#     CORS_ORIGIN = "https://staging.example.com"

# if os.getenv("ENVIRONMENT") == "PRODUCTION":
#     config = Config(RepositoryEnv("prod.env"))
#     CORS_ORIGIN = "https://example.com"

MYSQL_URI = config.get("MYSQL_URI", default=config.get("DATABASE_URL"))
PORT = config.get("AI_PORT", cast=int, default=5001)
JWT_ACCESS_EXPIRY = parse_timespan(config.get("JWT_ACCESS_EXPIRY", default=config.get("JWT_EXPIRES_IN", default="15m")))
JWT_REFRESH_EXPIRY = parse_timespan(config.get("JWT_REFRESH_EXPIRY", default=config.get("JWT_REFRESH_EXPIRES_IN", default="7d")))
SECRET_OR_KEY = config.get("SECRET_OR_KEY", cast=str, default=config.get("JWT_SECRET", default="defaultsecret"))

# SMTP_MAIL = config.get("MAIL")
# SMTP_HOST = config.get("HOST")
# SMTP_USER = config.get("USER_NAME")
# SMTP_PASS = config.get("PASSWORD")
# SMTP_PORT = config.get("MAILPORT", cast=int)
# SMTP_TLS = config.get("SECURE", cast=bool)

# __access_private_key_path = os.path.join(
#     os.path.dirname(__file__), "../private/access_private_key.pem"
# )
# __access_public_key_path = os.path.join(
#     os.path.dirname(__file__), "../private/access_public_key.pem"
# )
# __refresh_private_key_path = os.path.join(
#     os.path.dirname(__file__), "../private/refresh_private_key.pem"
# )
# __refresh_public_key_path = os.path.join(
#     os.path.dirname(__file__), "../private/refresh_public_key.pem"
# )

# JWT_ACCESS_KEY_PRIVATE = open(__access_private_key_path, "rb").read()
# JWT_ACCESS_KEY_PUBLIC = open(__access_public_key_path, "rb").read()
# JWT_REFRESH_KEY_PRIVATE = open(__refresh_private_key_path, "rb").read()
# JWT_REFRESH_KEY_PUBLIC = open(__refresh_public_key_path, "rb").read()



# HMAC KEYS

# HMAC_AUTH_SECRET = config.get("HMAC_AUTH_KEY")
HMAC_USER_SECRET = config.get("HMAC_USER_KEY", default="default_hmac_user_key")
HMAC_AI_KEY = config.get("HMAC_AI_KEY", default="default_hmac_ai_key")
# HMAC_CHAT_SECRET = config.get("HMAC_CHAT_KEY")
# HMAC_JOBS_SECRET = config.get("HMAC_JOBS_KEY")

# SERVICES
USER_SERVICE = config.get("USER_SERVICE", default="http://localhost:4004")
GEMINI_API_KEY = config.get("GEMINI_API_KEY", default="")
MODEL_NAME = "gemini-2.5-flash"
MODEL_TEMPERATURE = 0.4



# # AWS KEYS
# AWS_ACCESS_KEY = config.get("AWS_ACCESS_KEY_ID")
# AWS_SECRET_KEY = config.get("AWS_SECRET_ACCESS_KEY")
# AWS_REGION = config.get("AWS_DEFAULT_REGION")

# # AWS SES KEYS
# AWS_SES_ACCESS_KEY_ID = config.get("AWS_SES_ACCESS_KEY_ID")
# AWS_SES_SECRET_KEY = config.get("AWS_SES_SECRET_KEY")
# AWS_SES_REGION = config.get("AWS_SES_REGION")
# AWS_SOURCE_ADDRESS = config.get("AWS_SOURCE_ADDRESS")

# GOOGLE OAUTH KEYS
# GOOGLE_OAUTH_SECRET = config.get("GOOGLE_OAUTH_SECRET")
# GOOGLE_OAUTH_CLIENT = config.get("GOOGLE_OAUTH_CLIENT")
AWS_COGNITO_REGION = config.get("AWS_COGNITO_REGION")

# Twilio Configuration
TWILIO_ACCOUNT_SID = config.get("TWILIO_ACCOUNT_SID", default=None)
TWILIO_AUTH_TOKEN = config.get("TWILIO_AUTH_TOKEN", default=None)
TWILIO_PHONE_NUMBER = config.get("TWILIO_PHONE_NUMBER", default=None)
TWILIO_FLOW_SID = config.get("TWILIO_FLOW_SID", default=None)

# ElevenLabs Configuration
ELEVENLABS_API_KEY = config.get("ELEVENLABS_API_KEY", default=None)
ELEVENLABS_AGENT_ID = config.get("ELEVENLABS_AGENT_ID", default=None)
ELEVENLABS_PHONE_ID = config.get("ELEVENLABS_PHONE_ID", default=None)

# Cal.com Configuration
CALCOM_API_KEY = config.get("CALCOM_API_KEY", default=None)
CALCOM_EVENT_TYPE_ID = config.get("CALCOM_EVENT_TYPE_ID", default=None)


