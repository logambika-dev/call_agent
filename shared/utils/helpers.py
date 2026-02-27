import uuid
from datetime import datetime

def generate_id() -> str:
    """Generate unique ID"""
    return str(uuid.uuid4())

def get_timestamp() -> str:
    """Get current UTC timestamp"""
    return datetime.utcnow().isoformat() + "Z"

def format_phone(phone: str) -> str:
    """Format phone number to E.164"""
    return phone.strip().replace(" ", "").replace("-", "")
