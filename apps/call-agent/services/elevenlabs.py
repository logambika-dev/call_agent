import requests
from typing import Optional
from config.settings import settings

def trigger_call(client_data: dict, company_data: dict) -> Optional[str]:
    """Trigger ElevenLabs AI voice call"""
    
    url = "https://api.elevenlabs.io/v1/convai/conversation"
    
    headers = {
        "xi-api-key": settings.elevenlabs_api_key,
        "Content-Type": "application/json"
    }
    
    payload = {
        "agent_id": settings.elevenlabs_agent_id,
        "phone_number_id": settings.elevenlabs_phone_id,
        "phone_number": client_data["phone_number"],
        "metadata": {
            "client_name": client_data["name"],
            "client_email": client_data["email"],
            "client_company": client_data["company_name"],
            "company_name": company_data["company_name"],
            "company_phone": company_data["phone_number"],
            "company_url": company_data["company_url"],
            "context": company_data["company_knowledge_base"]
        }
    }
    
    try:
        response = requests.post(url, json=payload, headers=headers)
        response.raise_for_status()
        return response.json().get("conversation_id")
    except Exception as e:
        print(f"ElevenLabs error: {str(e)}")
        return None
