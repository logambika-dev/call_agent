import requests
import time
from typing import Dict, Optional
from loguru import logger
from config.main import ELEVENLABS_API_KEY, ELEVENLABS_AGENT_ID, ELEVENLABS_PHONE_ID

class ElevenLabsAgent:
    """ElevenLabs ConvAI Agent Integration"""

    def __init__(self):
        self.api_key = ELEVENLABS_API_KEY
        self.agent_id = ELEVENLABS_AGENT_ID
        self.phone_id = ELEVENLABS_PHONE_ID
        self.base_url = "https://api.elevenlabs.io/v1/convai"
        
        if not self.api_key or not self.agent_id:
            logger.warning("ElevenLabs credentials missing. Calls will fail.")
        else:
            logger.info("ElevenLabs Agent initialized")

    def make_call(self, phone: str, name: str, company: str) -> Dict:
        """Trigger an outbound call via ElevenLabs"""
        if not self.api_key or not self.agent_id or not self.phone_id:
            logger.error("Missing ElevenLabs credentials (API Key, Agent ID, or Phone ID)")
            return {"success": False, "error": "Missing credentials"}

        url = f"{self.base_url}/twilio/outbound-call"
        headers = {
            "xi-api-key": self.api_key,
            "Content-Type": "application/json"
        }
        
        # ElevenLabs ConvAI trigger payload
        payload = {
            "agent_id": self.agent_id,
            "agent_phone_number_id": self.phone_id,
            "to_number": phone
        }
        
        try:
            logger.info(f"Triggering ElevenLabs call to {phone}...")
            response = requests.post(url, json=payload, headers=headers)
            
            if response.status_code == 200:
                data = response.json()
                # ElevenLabs ConvAI fields can be conversation_id, conversationId, or id
                call_id = data.get("conversation_id") or data.get("conversationId") or data.get("id")
                
                if not call_id:
                    logger.error(f"ElevenLabs success (200) but no conversation ID found. Response Data: {data}")
                    return {
                        "success": False, 
                        "error": "No conversation ID returned from ElevenLabs",
                        "raw_response": data
                    }

                logger.info(f"ElevenLabs call initiated successfully: {call_id}")
                return {"success": True, "call_id": call_id, "status": "initiated"}
            else:
                error_msg = response.text
                logger.error(f"ElevenLabs call failed ({response.status_code}): {error_msg}")
                return {"success": False, "error": error_msg, "status_code": response.status_code}

        except Exception as e:
            logger.error(f"ElevenLabs call exception: {e}")
            return {"success": False, "error": str(e)}

    def get_transcript(self, call_id: str) -> Dict:
        """Get conversation details and transcript"""
        if not self.api_key:
            return {"success": False, "error": "Missing API Key"}

        url = f"{self.base_url}/conversations/{call_id}"
        headers = {
            "xi-api-key": self.api_key
        }

        try:
            response = requests.get(url, headers=headers)
            if response.status_code == 200:
                data = response.json()
                
                # Extract transcript
                # The structure usually contains 'transcript' list or similar.
                # We need to parse it into a string.
                transcript_items = data.get("transcript", [])
                transcript_text = ""
                for item in transcript_items:
                    role = item.get("role", "unknown")
                    message = item.get("message", "") # or 'text'
                    if not message:
                         message = item.get("text", "")
                    
                    transcript_text += f"{role}: {message}\n"

                status = data.get("status", "unknown") 
                
                # Metadata for recording
                audio_url = data.get("audio_url") # If available

                return {
                    "call_id": call_id,
                    "status": status,
                    "transcript": transcript_text.strip(),
                    "has_recording": bool(audio_url),
                    "recording_url": audio_url,
                    "raw_data": data # Keep raw data just in case
                }
            else:
                return {"success": False, "error": response.text}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def analyze_outcome(self, transcript: str) -> Dict:
        """Analyze call outcome based on transcript"""
        # We can reuse the same logic as VoiceAgent, or use an LLM here if wanted.
        # For now, reusing the simple keyword matching from the original agent is safest to maintain consistency 
        # unless user requested a smarter analyzer.
        # I'll copy the logic from VoiceAgent for now.
        
        text = transcript.lower()

        if any(w in text for w in ["interested", "demo", "yes", "schedule"]):
            return {
                "outcome": "interested",
                "qualified": True,
                "action": "schedule_meeting",
            }
        elif any(w in text for w in ["not interested", "no thanks", "stop", "unsubscribe"]):
            return {
                "outcome": "not_interested",
                "qualified": False,
                "action": "blocklist",
            }
        elif any(w in text for w in ["call back", "later", "busy"]):
            return {
                "outcome": "callback",
                "qualified": False,
                "action": "schedule_callback",
            }
        else:
            return {"outcome": "no_response", "qualified": False, "action": "follow_up"}

    def monitor_call_and_report(self, call_id: str, context: Dict):
        """
        Background task to monitor call, wait for completion, and report.
        ElevenLabs calls can be long.
        """
        logger.info(f"Starting background monitoring for ElevenLabs call {call_id}")
        
        # Poll for completion
        # Logic: Check status every 10s. If 'completed', 'success', 'failed', stop.
        # Max wait: 5 minutes? 10 minutes?
        
        max_retries = 60 # 60 * 5s = 5 mins
        final_status = None
        
        for _ in range(max_retries):
            details = self.get_transcript(call_id)
            if details.get("success") is False:
                logger.error(f"Error checking status for usage {call_id}")
                time.sleep(5)
                continue
                
            status = details.get("status")
            logger.debug(f"Call {call_id} is {status}")
            
            if status in ["completed", "call_end", "finished"]: # Check exact ElevenLabs status enum
                final_status = status
                break
            
            # If the call is very old, it might count as finished.
            
            time.sleep(5)
            
        # Get final transcript
        details = self.get_transcript(call_id)
        transcript_text = details.get("transcript", "")
        
        # Analyze
        analysis = self.analyze_outcome(transcript_text)
        
        # Report
        backend_data = {
            "call_id": call_id,
            "contact_id": context.get("contactId", 0),
            "campaign_id": context.get("campaignId", 0),
            "user_id": context.get("contactData", {}).get("userId"),
            "transcript": transcript_text,
            "outcome": analysis["outcome"],
            "picked": True if len(transcript_text) > 10 else False,
        }
        
        self.send_signal_to_backend(backend_data)
        logger.info(f"Finished monitoring for call {call_id}")

    def send_signal_to_backend(self, call_data: Dict) -> bool:
        """Send signal to backend"""
        # Exactly the same as VoiceAgent
        # We could extract this to a common utility, but for now copying is faster/safer than refactoring shared code.
        import os
        import requests
        
        backend_url = os.getenv("BACKEND_URL", "http://localhost:4004")
        webhook_url = f"{backend_url}/api/v1/call-agent/webhook/outcome"

        try:
            logger.info(f"Sending signal to backend: {webhook_url}")
            response = requests.post(webhook_url, json=call_data, timeout=10)
            if response.status_code == 200:
                logger.info("Successfully sent signal to backend.")
                return True
            else:
                logger.error(f"Failed to send signal. Status: {response.status_code}")
                return False
        except Exception as e:
            logger.error(f"Error sending signal to backend: {e}")
            return False
