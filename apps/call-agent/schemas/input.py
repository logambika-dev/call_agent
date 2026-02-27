from pydantic import BaseModel, EmailStr
from typing import Optional

class CompanyDetails(BaseModel):
    company_name: str
    company_location: str
    phone_number: str
    email: EmailStr
    company_url: str
    company_knowledge_base: str

class ClientData(BaseModel):
    name: str
    phone_number: str
    email: EmailStr
    company_name: str

class CallRequest(BaseModel):
    company_id: str
    transcript: str
    outcome: str
    client_data: Optional[ClientData] = None

class EmailReplyRequest(BaseModel):
    company_id: str
    client_data: ClientData
    reply_status: str
