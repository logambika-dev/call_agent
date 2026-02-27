from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Dict, Optional
# from backend.agents.elevenlabs_agent import ElevenLabsAgent
from agents.elevenlabs_agent import ElevenLabsAgent

router = APIRouter()
voice_agent = ElevenLabsAgent()

class CallRequest(BaseModel):
    phone: str
    name: str
    company: str
    context: Optional[Dict] = {}

class AnalyzeRequest(BaseModel):
    transcript: str

@router.post("/call")
async def make_call(request: CallRequest, background_tasks: BackgroundTasks):
    try:
        result = voice_agent.make_call(request.phone, request.name, request.company)
        if result.get("success") and result.get("call_id"):
             background_tasks.add_task(voice_agent.monitor_call_and_report, result['call_id'], request.context)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/transcript/{call_id}")
async def get_transcript(call_id: str):
    try:
        result = voice_agent.get_transcript(call_id)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/analyze")
async def analyze_call(request: AnalyzeRequest):
    try:
        result = voice_agent.analyze_outcome(request.transcript)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
