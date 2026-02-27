"""Execute LangGraph Call Agent"""
import csv
import time
from langgraph_agent import process_lead
from loguru import logger

def main():
    print("\n" + "="*70)
    print("LANGGRAPH CALL AGENT")
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
    
    results = []
    meetings = []
    
    for i, lead in enumerate(leads, 1):
        print(f"\n{'='*70}")
        print(f"[{i}/{len(leads)}] Processing {lead['name']}")
        print("="*70)
        
        try:
            result = process_lead(lead)
            
            if result['call_result'].get('success'):
                print(f"✓ Call: {result['call_result']['call_id']}")
                print(f"✓ Analysis: {result['analysis']['outcome']}")
                
                if result['meeting_scheduled']:
                    print(f"✓ Meeting scheduled")
                    meetings.append(lead['name'])
                
                results.append({'name': lead['name'], 'status': 'success'})
            else:
                print(f"✗ Call failed")
                results.append({'name': lead['name'], 'status': 'failed'})
        
        except Exception as e:
            logger.error(f"Error: {e}")
            results.append({'name': lead['name'], 'status': 'error'})
        
        if i < len(leads):
            print(f"\n[WAIT] 60s...")
            time.sleep(60)
    
    print(f"\n{'='*70}")
    print(f"COMPLETE: {len(results)} processed | {len(meetings)} meetings")
    print("="*70)

if __name__ == "__main__":
    main()
