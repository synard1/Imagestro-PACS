
from fastapi import APIRouter, Depends, HTTPException, Body
from typing import Dict, Any, Optional, List
from pydantic import BaseModel

from app.services.ai_service import AIService
from app.middleware.auth import get_current_user

router = APIRouter(
    prefix="/api/ai",
    tags=["ai"],
    responses={404: {"description": "Not found"}},
)

class ReportRequest(BaseModel):
    findings: str
    modality: str
    patient_info: Optional[Dict[str, Any]] = None

class TriageRequest(BaseModel):
    clinical_text: str
    current_priority: str = 'ROUTINE'

class ChatRequest(BaseModel):
    query: str
    context: Optional[Dict[str, Any]] = None

class ChatMessage(BaseModel):
    role: str
    content: str

class FlexibleChatRequest(BaseModel):
    messages: Optional[List[ChatMessage]] = None
    query: Optional[str] = None
    context: Optional[Dict[str, Any]] = None
    stream: bool = False

@router.post("/generate-report")
async def generate_report(request: ReportRequest, current_user: dict = Depends(get_current_user)):
    """Generate a draft report based on findings."""
    return AIService.generate_report_draft(request.findings, request.modality, request.patient_info)

@router.post("/analyze-priority")
async def analyze_priority(request: TriageRequest, current_user: dict = Depends(get_current_user)):
    """Analyze text for triage priority."""
    priority = AIService.analyze_priority(request.clinical_text, request.current_priority)
    return {"priority": priority}

@router.get("/suggestions")
async def get_suggestions(current_user: dict = Depends(get_current_user)):
    """Get default suggestion chips for initial chat state."""
    return {"suggestions": AIService.get_default_suggestions()}

@router.get("/init")
async def get_ai_init(page: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """Get initial AI configuration and suggestion chips."""
    return AIService.get_init_config(page=page)

@router.post("/chat-analytics")
async def chat_analytics(request: ChatRequest, current_user: dict = Depends(get_current_user)):
    """Process natural language query for analytics (Legacy single-turn)."""
    return AIService.chat_analytics(request.query, request.context, user_data=current_user)

@router.post("/chat")
async def chat_flexible(request: FlexibleChatRequest, current_user: dict = Depends(get_current_user)):
    """
    Flexible conversational endpoint.
    Supports multi-turn chat, context, and hybrid responses (Text/Chart/KPI).
    Supports streaming if 'stream' is True.
    """
    # Normalize input: if query is provided, convert to single user message
    if request.query and not request.messages:
        request.messages = [ChatMessage(role="user", content=request.query)]
        
    if not request.messages:
        raise HTTPException(status_code=400, detail="Either 'messages' list or 'query' string must be provided")

    if request.stream:
        from fastapi.responses import StreamingResponse
        return StreamingResponse(
            AIService.chat_flexible_stream(request.messages, request.context, user_data=current_user),
            media_type="text/event-stream"
        )

    return AIService.chat_flexible(request.messages, request.context, user_data=current_user)
