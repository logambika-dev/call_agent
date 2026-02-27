import requests
from typing import Optional
from config.settings import settings

def book_meeting(client_data: dict, company_data: dict) -> Optional[str]:
    """Book meeting via Cal.com API"""
    
    url = "https://api.cal.com/v1/bookings"
    
    headers = {
        "Authorization": f"Bearer {settings.calcom_api_key}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "eventTypeId": settings.calcom_event_type_id,
        "name": client_data["name"],
        "email": client_data["email"],
        "metadata": {
            "phone": client_data["phone_number"],
            "company": client_data["company_name"]
        }
    }
    
    try:
        response = requests.post(url, json=payload, headers=headers)
        response.raise_for_status()
        booking = response.json()
        return booking.get("booking_url") or f"https://cal.com/booking/{booking.get('uid')}"
    except Exception as e:
        print(f"Cal.com error: {str(e)}")
        return None
