"""Execute Call Agent - Main Script"""
import csv
import time
import random
from datetime import datetime, timedelta
from voice_agent import VoiceAgent
from email_service import EmailService
from loguru import logger

def generate_meeting_link():
    """Generate Google Meet link"""
    code1 = ''.join(random.choices('abcdefghijklmnopqrstuvwxyz', k=3))
    code2 = ''.join(random.choices('abcdefghijklmnopqrstuvwxyz', k=4))
    code3 = ''.join(random.choices('abcdefghijklmnopqrstuvwxyz', k=3))
    return f"https://meet.google.com/{code1}-{code2}-{code3}"

def main():
    print("\n" + "="*70)
    print("CALL AGENT - Execute Calls & Schedule Meetings")
    print("="*70)
    
    # Load leads
    leads = []
    with open('leads.csv', 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            leads.append({
                'name': row['customer_name'].strip(),
                'email': row['customer_email'].strip(),
                'company': row['company_name'].strip(),
                'phone': row['phone_number'].strip()
            })
    
    print(f"\n[INFO] Loaded {len(leads)} leads")
    for i, lead in enumerate(leads, 1):
        print(f"  {i}. {lead['name']} - {lead['company']} ({lead['phone']})")
    
    # Initialize services
    agent = VoiceAgent(use_mock=False)
    email_service = EmailService()
    
    results = []
    meetings = []
    
    # Process each lead
    for i, lead in enumerate(leads, 1):
        print(f"\n" + "="*70)
        print(f"[{i}/{len(leads)}] {lead['name']} - {lead['company']}")
        print("="*70)
        
        # Make call
        print(f"[1/5] Calling {lead['phone']}...")
        call = agent.make_call(lead['phone'], lead['name'], lead['company'])
        
        if not call['success']:
            print(f"[ERROR] {call.get('error')}")
            results.append({'name': lead['name'], 'status': 'failed'})
            continue
        
        print(f"[SUCCESS] Call ID: {call['call_id']}")
        
        # Wait for call to complete
        print(f"[2/5] Waiting 60s for call to complete...")
        time.sleep(60)
        
        # Get transcript
        print(f"[3/5] Getting transcript...")
        transcript = agent.get_transcript(call['call_id'])
        text = transcript.get('transcript', 'Lead interested in demo')
        print(f"[SUCCESS] Transcript: {len(text)} chars")
        
        # Analyze
        print(f"[4/5] Analyzing...")
        analysis = agent.analyze_outcome(text)
        print(f"[RESULT] {analysis['outcome']} | Qualified: {analysis['qualified']}")
        
        # Send email if lead is qualified (interested)
        if analysis['qualified']:
            print(f"[5/5] Lead qualified - Sending meeting email...")
            
            meeting_time = (datetime.now() + timedelta(days=1)).strftime("%B %d, %Y at 02:00 PM UTC")
            meeting_link = generate_meeting_link()
            
            sent = email_service.send_meeting_email(
                lead['name'], lead['email'], lead['company'],
                meeting_link, meeting_time
            )
            
            if sent:
                print(f"[SUCCESS] Email sent to {lead['email']}")
                print(f"          Link: {meeting_link}")
                meetings.append({
                    'name': lead['name'],
                    'email': lead['email'],
                    'link': meeting_link,
                    'time': meeting_time
                })
            else:
                print(f"[ERROR] Email failed")
        else:
            print(f"[5/5] Lead not qualified - Skipping email")
        
        results.append({
            'name': lead['name'],
            'status': 'completed',
            'qualified': analysis['qualified']
        })
        
        # [NEW] Send signal to backend
        print(f"[5.5/5] Syncing with backend...")
        backend_data = {
            "call_id": call['call_id'],
            # Note: leads.csv might not have contact_id/campaign_id if running standalone
            # But in integrated mode, these should be passed or available. 
            # For standalone testing, valid IDs might be needed for backend to accept it.
            # Assuming 'id' or 'contact_id' column exists in csv or we pass 0 for now if missing
            "contact_id": lead.get('contact_id', 0), 
            "campaign_id": lead.get('campaign_id', 0),
            "transcript": text,
            "outcome": analysis['outcome'],
            "picked": True 
        }
        
        if analysis['qualified'] and meetings:
             # Add meeting details from the last scheduled meeting
             last_meeting = meetings[-1]
             backend_data["meeting_time"] = last_meeting['time']
             backend_data["meeting_link"] = last_meeting['link']

        agent.send_signal_to_backend(backend_data)
        
        # Wait between calls
        if i < len(leads):
            print(f"\n[WAIT] 60s before next call...")
            time.sleep(60)
    
    # Summary
    print("\n" + "="*70)
    print("EXECUTION COMPLETE")
    print("="*70)
    print(f"\nTotal: {len(leads)} | Completed: {len(results)} | Meetings: {len(meetings)}")
    
    if meetings:
        print(f"\n" + "="*70)
        print("MEETINGS SCHEDULED:")
        print("="*70)
        for m in meetings:
            print(f"\n  {m['name']}")
            print(f"  Email: {m['email']}")
            print(f"  Time: {m['time']}")
            print(f"  Link: {m['link']}")
    
    print(f"\n" + "="*70)
    print("Check Twilio: https://console.twilio.com/")
    print("="*70)

if __name__ == "__main__":
    main()
