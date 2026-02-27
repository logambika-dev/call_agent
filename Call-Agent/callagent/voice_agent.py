"""Voice Agent - AI-Powered Call System"""
import os
import time
from typing import Dict, Optional
from twilio.rest import Client
from loguru import logger
from dotenv import load_dotenv

# Load environment variables from the BE root .env
env_path = os.path.join(os.path.dirname(__file__), "..", "..", "..", ".env")
load_dotenv(env_path)

class VoiceAgent:
    """AI Voice Agent using Twilio Studio Flow"""
    
    def __init__(self, use_mock: bool = False):
        self.use_mock = use_mock
        self.flow_sid = os.getenv("TWILIO_FLOW_SID")
        self.twilio_number = os.getenv("TWILIO_PHONE_NUMBER")
        
        if not use_mock:
            sid = os.getenv("TWILIO_ACCOUNT_SID")
            token = os.getenv("TWILIO_AUTH_TOKEN")
            if sid and token:
                self.client = Client(sid, token)
                logger.info("Twilio initialized")
            else:
                self.client = None
                logger.warning("Twilio credentials missing")
        else:
            self.client = None
            logger.info("Mock mode enabled")
    
    def make_call(self, phone: str, name: str, company: str) -> Dict:
        """Make AI call"""
        logger.info(f"Calling {name} at {phone}")
        
        if self.use_mock or not self.client:
            return self._mock_call(phone, name)
        
        try:
            # Use TwiML directly instead of Studio Flow to avoid "application error"
            twiml = f'''<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Joanna">Hello {name}, this is an A I assistant from No2bounce. We wanted to reach out about our services. Are you interested in scheduling a demo? Please respond after the beep.</Say>
    <Record maxLength="10" transcribe="true" transcribeCallback="" />
    <Say voice="Polly.Joanna">Thank you for your response. Goodbye.</Say>
</Response>'''
            
            call = self.client.calls.create(
                to=phone,
                from_=self.twilio_number,
                twiml=twiml,
                record=True
            )
            
            logger.info(f"Call initiated: {call.sid}")
            return {"success": True, "call_id": call.sid, "status": call.status}
            
        except Exception as e:
            logger.error(f"Call failed: {e}")
            return {"success": False, "error": str(e)}
    
    def get_transcript(self, call_id: str, max_retries: int = 5) -> Dict:
        """Get call transcript with retry logic for transcription processing"""
        if self.use_mock or not self.client:
            return self._mock_transcript(call_id)
        
        try:
            call = self.client.calls(call_id).fetch()
            
            # Wait for recordings to be available with retry
            for attempt in range(max_retries):
                recordings = self.client.recordings.list(call_sid=call_id, limit=10)
                
                if recordings:
                    logger.info(f"Found {len(recordings)} recording(s) for call {call_id}")
                    break
                    
                logger.info(f"No recordings yet for {call_id}, attempt {attempt + 1}/{max_retries}")
                time.sleep(3)
            else:
                return {"call_id": call_id, "transcript": f"Call {call.status}. No recording available.", "has_recording": False}
            
            # Try to get transcription with retry
            transcript_text = ""
            for rec in recordings:
                logger.info(f"Processing recording {rec.sid}")
                
                for trans_attempt in range(max_retries):
                    try:
                        transcriptions = self.client.transcriptions.list(limit=50)
                        for trans in transcriptions:
                            if trans.recording_sid == rec.sid:
                                if trans.status == "completed":
                                    full_trans = self.client.transcriptions(trans.sid).fetch()
                                    if hasattr(full_trans, 'transcription_text') and full_trans.transcription_text:
                                        transcript_text += full_trans.transcription_text + " "
                                        logger.info(f"Got transcription: {full_trans.transcription_text[:100]}...")
                                elif trans.status == "in-progress":
                                    logger.info(f"Transcription {trans.sid} still in progress, waiting...")
                                    time.sleep(5)
                                    continue
                    except Exception as trans_err:
                        logger.error(f"Error fetching transcription: {trans_err}")
                    
                    if transcript_text:
                        break
                    
                    logger.info(f"Waiting for transcription, attempt {trans_attempt + 1}/{max_retries}")
                    time.sleep(5)
            
            if transcript_text.strip():
                return {"call_id": call_id, "transcript": transcript_text.strip(), "has_recording": True}
            elif recordings:
                rec_url = f"https://api.twilio.com{recordings[0].uri.replace('.json', '.mp3')}"
                return {
                    "call_id": call_id, 
                    "transcript": f"Call {call.status}. Recording available at: {rec_url}. Transcription pending.", 
                    "has_recording": True,
                    "recording_url": rec_url
                }
            else:
                return {"call_id": call_id, "transcript": f"Call {call.status}. No recording yet.", "has_recording": False}
        except Exception as e:
            logger.error(f"Transcript error: {e}")
            return {"call_id": call_id, "transcript": f"Error getting transcript: {str(e)}", "has_recording": False}
    
    def analyze_outcome(self, transcript: str) -> Dict:
        """Analyze call outcome using AI"""
        if not transcript or len(transcript.strip()) < 10:
            return {
                "outcome": "no_response",
                "qualified": False,
                "action": "follow_up"
            }
        
        text = transcript.lower().strip()
        
        # Positive indicators (interested)
        positive_keywords = ["yes", "interested", "demo", "schedule", "meeting", "sure", "sounds good", 
                            "tell me more", "want to", "would like", "sign up", "absolutely", "definitely"]
        positive_score = sum(1 for kw in positive_keywords if kw in text)
        
        # Negative indicators (not interested)
        negative_keywords = ["no", "not interested", "no thanks", "stop", "don't", "never", 
                            "remove", "unsubscribe", "busy", "not now", "maybe later"]
        negative_score = sum(1 for kw in negative_keywords if kw in text)
        
        # Callback indicators
        callback_keywords = ["call back", "later", "next week", "another time", "busy now", "not available"]
        callback_score = sum(1 for kw in callback_keywords if kw in text)
        
        logger.info(f"Analysis scores - Positive: {positive_score}, Negative: {negative_score}, Callback: {callback_score}")
        logger.info(f"Transcript: {text[:100]}...")
        
        # Decision logic
        if positive_score > negative_score and positive_score > 0:
            return {
                "outcome": "interested",
                "qualified": True,
                "action": "schedule_meeting",
                "confidence": positive_score / (positive_score + negative_score + callback_score)
            }
        elif callback_score > 0 and callback_score >= negative_score:
            return {
                "outcome": "callback",
                "qualified": False,
                "action": "schedule_callback",
                "confidence": callback_score / (positive_score + negative_score + callback_score)
            }
        elif negative_score > 0:
            return {
                "outcome": "not_interested",
                "qualified": False,
                "action": "blocklist",
                "confidence": negative_score / (positive_score + negative_score + callback_score)
            }
        else:
            return {
                "outcome": "unclear",
                "qualified": False,
                "action": "follow_up",
                "confidence": 0.0
            }
    
    def _mock_call(self, phone: str, name: str) -> Dict:
        """Mock call"""
        call_id = f"MOCK_{phone[-4:]}"
        logger.info(f"[MOCK] Call to {name}: {call_id}")
        return {"success": True, "call_id": call_id, "status": "completed", "mock": True}
    
    def _mock_transcript(self, call_id: str) -> Dict:
        """Mock transcript"""
        return {
            "call_id": call_id,
            "transcript": "Agent: Hi, interested in a demo? Lead: Yes, sounds good!",
            "has_recording": True,
            "mock": True
        }

    def send_signal_to_backend(self, call_data: Dict) -> bool:
        """Send call outcome and transcript to backend webhook"""
        import requests
        import json
        
        backend_url = os.getenv("BACKEND_URL", "http://localhost:4004")
        webhook_url = f"{backend_url}/api/v1/call-agent/webhook/outcome"
        
        try:
            # Prepare payload matching the backend expectation
            payload = {
                "call_id": call_data.get("call_id"),
                "contact_id": call_data.get("contact_id"), 
                "campaign_id": call_data.get("campaign_id"),
                "outcome": call_data.get("outcome"),
                "picked": call_data.get("picked", True), # Assume picked if we have a transcript usually
                "transcript": call_data.get("transcript"),
                "meeting_time": call_data.get("meeting_time"),
                "meeting_link": call_data.get("meeting_link"),
                "meeting_id": call_data.get("meeting_id")
            }
            
            logger.info(f"Sending signal to backend: {webhook_url}")
            # logger.debug(f"Payload: {json.dumps(payload, indent=2)}")
            
            response = requests.post(webhook_url, json=payload, timeout=10)
            
            if response.status_code == 200:
                logger.info(f"Successfully sent signal to backend. Response: {response.json()}")
                return True
            else:
                logger.error(f"Failed to send signal. Status: {response.status_code}, Response: {response.text}")
                return False
                
        except Exception as e:
            logger.error(f"Error sending signal to backend: {e}")
            return False
