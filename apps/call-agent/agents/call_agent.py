from typing import Optional

class CallAgent:
    """AI Call Agent with prompt and logic"""
    
    def __init__(self, company_data: dict):
        self.company_data = company_data
        self.system_prompt = self._build_prompt()
    
    def _build_prompt(self) -> str:
        """Build system prompt with company context"""
        return f"""
You are an AI sales agent for {self.company_data['company_name']}.

Company Information:
- Name: {self.company_data['company_name']}
- Location: {self.company_data['company_location']}
- Phone: {self.company_data['phone_number']}
- Website: {self.company_data['company_url']}

Knowledge Base:
{self.company_data['company_knowledge_base']}

Your goal is to:
1. Engage prospects professionally
2. Understand their needs
3. Explain our solutions
4. Collect contact information if interested
5. Schedule demos for qualified leads

Be conversational, helpful, and concise.
        """
    
    def get_prompt(self) -> str:
        """Get the system prompt"""
        return self.system_prompt
    
    def should_book_meeting(self, outcome: str) -> bool:
        """Determine if meeting should be booked"""
        return outcome.lower() in ["interested_demo", "interested", "schedule_demo"]
