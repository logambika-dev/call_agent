"""LangGraph Agentic Call System"""
from typing import TypedDict, Annotated, Literal
from langgraph.graph import StateGraph, END
from voice_agent import VoiceAgent
from email_service import EmailService
from gmeet_service import GoogleMeetService
from loguru import logger
from datetime import datetime, timedelta

class AgentState(TypedDict):
    """Agent state"""
    lead: dict
    call_result: dict
    transcript: dict
    analysis: dict
    meeting_scheduled: bool
    error: str | None

def call_node(state: AgentState) -> AgentState:
    """Make call"""
    logger.info(f"Calling {state['lead']['name']}")
    agent = VoiceAgent(use_mock=False)
    result = agent.make_call(
        state['lead']['phone'],
        state['lead']['name'],
        state['lead']['company']
    )
    state['call_result'] = result
    return state

def transcript_node(state: AgentState) -> AgentState:
    """Get transcript with delay for processing"""
    logger.info("Waiting for transcript processing...")
    import time
    time.sleep(10)  # Give Twilio time to process recording
    
    agent = VoiceAgent(use_mock=False)
    transcript = agent.get_transcript(state['call_result']['call_id'])
    state['transcript'] = transcript
    logger.info(f"Transcript received: {transcript.get('transcript', '')[:100]}")
    return state

def analyze_node(state: AgentState) -> AgentState:
    """Analyze outcome"""
    logger.info("Analyzing call")
    agent = VoiceAgent(use_mock=False)
    transcript_text = state['transcript'].get('transcript', '')
    
    logger.info(f"Analyzing transcript: {transcript_text[:200]}...")
    analysis = agent.analyze_outcome(transcript_text)
    logger.info(f"Analysis result: {analysis}")
    
    state['analysis'] = analysis
    state['analysis'] = analysis
    
    # [NEW] Sync with backend
    try:
        backend_data = {
            "call_id": state['call_result'].get('success') and state['call_result'].get('call_id'),
            "contact_id": state['lead'].get('contact_id', 0),
            "campaign_id": state['lead'].get('campaign_id', 0),
            "transcript": transcript_text,
            "outcome": analysis['outcome'],
            "picked": True
        }
        agent.send_signal_to_backend(backend_data)
    except Exception as e:
        logger.error(f"Failed to sync with backend: {e}")

    return state

def email_node(state: AgentState) -> AgentState:
    """Send meeting email with real Google Meet link"""
    logger.info("Creating Google Meet and sending email")
    
    gmeet_service = GoogleMeetService()
    meeting_result = gmeet_service.create_meeting(
        state['lead']['name'],
        state['lead']['email'],
        state['lead']['company']
    )
    
    if meeting_result['success']:
        email_service = EmailService()
        sent = email_service.send_meeting_email(
            state['lead']['name'],
            state['lead']['email'],
            state['lead']['company'],
            meeting_result['meeting_link'],
            meeting_result['meeting_time']
        )
        state['meeting_scheduled'] = sent
    else:
        logger.error(f"Meeting creation failed: {meeting_result.get('error')}")
        state['meeting_scheduled'] = False
    
    return state

def should_send_email(state: AgentState) -> Literal["email", "end"]:
    """Route based on qualification"""
    if not state['call_result'].get('success'):
        return "end"
    return "email" if state['analysis'].get('qualified') else "end"

def build_graph() -> StateGraph:
    """Build LangGraph workflow"""
    workflow = StateGraph(AgentState)
    
    workflow.add_node("call", call_node)
    workflow.add_node("transcript", transcript_node)
    workflow.add_node("analyze", analyze_node)
    workflow.add_node("email", email_node)
    
    workflow.set_entry_point("call")
    workflow.add_edge("call", "transcript")
    workflow.add_edge("transcript", "analyze")
    workflow.add_conditional_edges("analyze", should_send_email, {"email": "email", "end": END})
    workflow.add_edge("email", END)
    
    return workflow.compile()

def process_lead(lead: dict) -> dict:
    """Process single lead through graph"""
    graph = build_graph()
    
    initial_state = AgentState(
        lead=lead,
        call_result={},
        transcript={},
        analysis={},
        meeting_scheduled=False,
        error=None
    )
    
    result = graph.invoke(initial_state)
    return result


# Export for integration with backend
__all__ = ['process_lead', 'AgentState', 'build_graph']
