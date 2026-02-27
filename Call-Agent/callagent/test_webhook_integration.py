"""
Test Script: Call Agent Webhook Integration
"""
import sys
import os
import time
from voice_agent import VoiceAgent

# Ensure we can import modules from current directory
sys.path.append(os.getcwd())

def test_webhook_integration():
    print("="*60)
    print("TEST: Call Agent Webhook Integration")
    print("="*60)
    
    # 1. Initialize Agent in Mock Mode
    print("\n[1] Initializing VoiceAgent (Mock Mode)...")
    agent = VoiceAgent(use_mock=True)
    
    # 2. Simulate Call Data
    call_id = f"TEST_CALL_{int(time.time())}"
    contact_id = 999999 # Use a dummy ID, or 0. Backend handles it.
    campaign_id = 1
    
    transcript = "Agent: Hello, this is AI. Lead: Yes, I am interested in a demo."
    outcome = "interested"
    
    mock_data = {
        "call_id": call_id,
        "contact_id": contact_id,
        "campaign_id": campaign_id,
        "transcript": transcript,
        "outcome": outcome,
        "picked": True
    }
    
    print("\n[2] Sending Signal to Backend...")
    print(f"    Call ID: {call_id}")
    print(f"    Transcript: {transcript}")
    
    # 3. Send Signal
    success = agent.send_signal_to_backend(mock_data)
    
    if success:
        print("\n[SUCCESS] Webhook signal sent successfully!")
        print("Check backend logs or database to confirm receipt.")
    else:
        print("\n[FAILED] Webhook signal failed.")
        print("Ensure backend is running at http://localhost:4004")

if __name__ == "__main__":
    test_webhook_integration()
