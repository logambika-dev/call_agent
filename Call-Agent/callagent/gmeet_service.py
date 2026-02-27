"""Google Meet Service - Create Real Meeting Links"""
import os
from datetime import datetime, timedelta
from loguru import logger
from dotenv import load_dotenv
import requests

# Load environment variables from the BE root .env
env_path = os.path.join(os.path.dirname(__file__), "..", "..", "..", ".env")
load_dotenv(env_path)

class GoogleMeetService:
    """Create real Google Meet links via Google Calendar API"""
    
    def __init__(self):
        self.client_id = os.getenv("GOOGLE_CLIENT_ID")
        self.client_secret = os.getenv("GOOGLE_CLIENT_SECRET")
        self.refresh_token = os.getenv("GOOGLE_REFRESH_TOKEN")
        self.calendar_id = os.getenv("GOOGLE_CALENDAR_ID", "primary")
        self.access_token = None
    
    def _get_access_token(self) -> str:
        """Get access token from refresh token"""
        try:
            response = requests.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                    "refresh_token": self.refresh_token,
                    "grant_type": "refresh_token"
                }
            )
            response.raise_for_status()
            self.access_token = response.json()["access_token"]
            return self.access_token
        except Exception as e:
            logger.error(f"Token refresh failed: {e}")
            raise
    
    def create_meeting(self, name: str, email: str, company: str, duration_minutes: int = 30) -> dict:
        """Create Google Meet meeting"""
        try:
            if not self.access_token:
                self._get_access_token()
            
            start_time = datetime.now() + timedelta(days=1)
            start_time = start_time.replace(hour=14, minute=0, second=0, microsecond=0)
            end_time = start_time + timedelta(minutes=duration_minutes)
            
            event = {
                "summary": f"Demo Meeting - {company}",
                "description": f"Product demo with {name} from {company}",
                "start": {
                    "dateTime": start_time.isoformat(),
                    "timeZone": "UTC"
                },
                "end": {
                    "dateTime": end_time.isoformat(),
                    "timeZone": "UTC"
                },
                "attendees": [{"email": email}],
                "conferenceData": {
                    "createRequest": {
                        "requestId": f"meet-{int(datetime.now().timestamp())}",
                        "conferenceSolutionKey": {"type": "hangoutsMeet"}
                    }
                },
                "reminders": {
                    "useDefault": False,
                    "overrides": [
                        {"method": "email", "minutes": 24 * 60},
                        {"method": "popup", "minutes": 30}
                    ]
                }
            }
            
            response = requests.post(
                f"https://www.googleapis.com/calendar/v3/calendars/{self.calendar_id}/events?conferenceDataVersion=1",
                headers={"Authorization": f"Bearer {self.access_token}"},
                json=event
            )
            response.raise_for_status()
            
            event_data = response.json()
            meet_link = event_data.get("hangoutLink") or event_data.get("conferenceData", {}).get("entryPoints", [{}])[0].get("uri", "")
            
            logger.info(f"Meeting created: {meet_link}")
            return {
                "success": True,
                "meeting_link": meet_link,
                "meeting_time": start_time.strftime("%B %d, %Y at %I:%M %p UTC"),
                "event_id": event_data["id"]
            }
            
        except Exception as e:
            logger.error(f"Meeting creation failed: {e}")
            return {"success": False, "error": str(e)}
