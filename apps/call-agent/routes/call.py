from fastapi import APIRouter, HTTPException
from datetime import datetime
import uuid

from schemas.input import CompanyDetails, CallRequest, EmailReplyRequest
from schemas.output import CallResponse, EmailReplyResponse, CompanyResponse
from services import elevenlabs, calcom, smtp
from agents.call_agent import CallAgent

router = APIRouter()

# In-memory storage
companies_db = {}
clients_db = {}

@router.post("/company", status_code=201, response_model=CompanyResponse)
async def create_company(company: CompanyDetails):
    """Store company details (data_1)"""
    company_id = str(uuid.uuid4())
    companies_db[company_id] = company.dict()
    return CompanyResponse(company_id=company_id, message="Company details stored")

@router.get("/company/{company_id}")
async def get_company(company_id: str):
    """Retrieve company details"""
    if company_id not in companies_db:
        raise HTTPException(status_code=404, detail="Company not found")
    return companies_db[company_id]

@router.post("/call/complete", response_model=CallResponse)
async def complete_call(call_data: CallRequest):
    """Process call completion with client data (data_2)"""
    
    if call_data.company_id not in companies_db:
        raise HTTPException(status_code=404, detail="Company not found")
    
    company = companies_db[call_data.company_id]
    agent = CallAgent(company)
    
    client_id = str(uuid.uuid4())
    meeting_booked = False
    meeting_link = None
    email_sent = False
    
    if call_data.client_data and agent.should_book_meeting(call_data.outcome):
        clients_db[client_id] = call_data.client_data.dict()
        
        # Book meeting
        meeting_link = calcom.book_meeting(call_data.client_data.dict(), company)
        meeting_booked = meeting_link is not None
        
        # Send email
        if meeting_booked:
            email_sent = smtp.send_meeting_email(call_data.client_data.dict(), company, meeting_link)
    
    return CallResponse(
        client_id=client_id,
        transcript=call_data.transcript,
        outcome=call_data.outcome,
        meeting_booked=meeting_booked,
        meeting_link=meeting_link,
        email_sent=email_sent,
        client_data=call_data.client_data,
        timestamp=datetime.utcnow().isoformat() + "Z"
    )

@router.post("/email/reply", response_model=EmailReplyResponse)
async def handle_email_reply(reply_data: EmailReplyRequest):
    """Handle email reply and trigger ElevenLabs call if positive"""
    
    if reply_data.company_id not in companies_db:
        raise HTTPException(status_code=404, detail="Company not found")
    
    company = companies_db[reply_data.company_id]
    
    if reply_data.reply_status.lower() == "positive":
        call_id = elevenlabs.trigger_call(reply_data.client_data.dict(), company)
        
        if call_id:
            return EmailReplyResponse(
                call_triggered=True,
                call_id=call_id,
                message="ElevenLabs call triggered successfully"
            )
        else:
            return EmailReplyResponse(
                call_triggered=False,
                call_id=None,
                message="Failed to trigger ElevenLabs call"
            )
    
    return EmailReplyResponse(
        call_triggered=False,
        call_id=None,
        message="No call triggered - reply was not positive"
    )
