from fastapi import APIRouter

from route.call_agent import router as call_agent_router

router = APIRouter()

router.include_router(prefix="/agent", router=call_agent_router)