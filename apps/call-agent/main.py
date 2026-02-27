from fastapi import FastAPI
from routes.call import router as call_router

app = FastAPI(title="Call Agent API", version="1.0")

app.include_router(call_router, prefix="/api")

@app.get("/")
async def root():
    return {"message": "Call Agent API", "version": "1.0"}
