from pydantic import BaseModel
from typing import Optional
from schemas.input import ClientData

class CallResponse(BaseModel):
    client_id: str
    transcript: str
    outcome: str
    meeting_booked: bool
    meeting_link: Optional[str]
    email_sent: bool
    client_data: Optional[ClientData]
    timestamp: str

class EmailReplyResponse(BaseModel):
    call_triggered: bool
    call_id: Optional[str]
    message: str

class CompanyResponse(BaseModel):
    company_id: str
    message: str
