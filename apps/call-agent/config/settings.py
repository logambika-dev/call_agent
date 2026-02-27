from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    # Cal.com
    calcom_api_key: str
    calcom_event_type_id: int
    
    # SMTP
    smtp_host: str
    smtp_port: int
    smtp_username: str
    smtp_password: str
    smtp_use_tls: bool = True
    
    # ElevenLabs
    elevenlabs_api_key: str
    elevenlabs_agent_id: str
    elevenlabs_phone_id: str
    
    # Database
    database_url: Optional[str] = None
    
    class Config:
        env_file = ".env"

settings = Settings()
