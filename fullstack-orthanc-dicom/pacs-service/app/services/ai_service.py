from typing import Dict, Any, List, Optional, Union
import re
import json
import logging
import asyncio
from datetime import datetime
from app.config import settings
from app.services.smart_query_service import SmartQueryService

# Try to import Gemini SDK
try:
    import google.generativeai as genai
    HAS_GEMINI = True
except ImportError:
    HAS_GEMINI = False

# Try to import OpenAI SDK
try:
    from openai import OpenAI
    HAS_OPENAI = True
except ImportError:
    HAS_OPENAI = False

logger = logging.getLogger(__name__)

class AIService:
    """
    AI Service for PACS features with robust stream handling and user data extraction.
    """

    @staticmethod
    def get_status() -> Dict[str, Any]:
        """Verify AI configuration status"""
        provider = settings.ai_provider
        status = {"provider": provider, "ready": False, "details": ""}
        if provider == 'mock':
            status["ready"] = True
            status["details"] = "Using Rule-Based Logic"
        elif provider == 'gemini' or provider == 'openai':
            status["ready"] = True
            status["details"] = f"{provider.capitalize()} Ready"
        return status

    @staticmethod
    def _get_openai_client():
        if not HAS_OPENAI: return None
        api_key = settings.gemini_api_key or "dummy"
        base_url = settings.ai_api_base_url if settings.ai_api_base_url else None
        try:
            return OpenAI(api_key=api_key, base_url=base_url)
        except Exception: return None

    @staticmethod
    def _clean_json_response(content: Optional[str]) -> str:
        if not content: return "{}"
        content = content.strip()
        # Remove markdown blocks
        content = re.sub(r'^```(?:json)?\s*', '', content)
        content = re.sub(r'\s*```$', '', content)
        
        # Find the first valid JSON object
        # If there are multiple objects (Extra data error), we only want the first one
        try:
            # Try finding the first { and the matching }
            start = content.find('{')
            if start == -1: return "{}"
            
            # Use a simple counter to find matching closing brace
            bracket_count = 0
            for i in range(start, len(content)):
                if content[i] == '{':
                    bracket_count += 1
                elif content[i] == '}':
                    bracket_count -= 1
                    if bracket_count == 0:
                        return content[start:i+1]
        except Exception:
            pass
            
        return "{}"

    @staticmethod
    def _strip_json_artifacts(text: str) -> str:
        text = re.sub(r'```json.*?```', '', text, flags=re.DOTALL)
        text = re.sub(r'```.*?```', '', text, flags=re.DOTALL)
        # Only replace if it looks like a JSON property at the start/end
        if text.startswith('{') and '}' in text:
            try:
                data = json.loads(text)
                if isinstance(data, dict) and 'content' in data:
                    return str(data['content'])
            except:
                pass
        return text.replace('{', '').replace('}', '').strip()

    @staticmethod
    def get_default_suggestions(page: str = None) -> List[str]:
        try:
            suggestions = []
            try:
                sql_urgent = "SELECT count(*) as count FROM orders WHERE priority IN ('URGENT', 'STAT') AND status NOT IN ('completed', 'cancelled', 'DELETED')"
                res = SmartQueryService.execute_query(sql_urgent)
                count = res[0]['count'] if res else 0
                if count > 0: suggestions.append(f"⚠️ {count} Order URGENT")
            except Exception: pass
            suggestions.extend(["Study Hari Ini", "Statistik Modality", "Performa Dokter"])
            return [s for s in suggestions if s][:4]
        except Exception:
            return ["Pasien hari ini", "Order URGENT", "Statistik Modality"]

    @staticmethod
    def get_init_config(page: str = None) -> Dict[str, Any]:
        return {
            "status": "ready",
            "welcome_message": "Halo! Saya adalah asisten AI PACS Anda.",
            "suggestions": AIService.get_default_suggestions(page=page)
        }

    @staticmethod
    async def chat_flexible_stream(messages: List[Any], context_data: Dict = None, user_data: Dict = None):
        client = AIService._get_openai_client()
        if not client:
            yield "data: " + json.dumps({"type": "error", "content": "AI not configured"}) + "\n\n"
            return

        try:
            username = (user_data or {}).get("full_name") or (user_data or {}).get("username") or "User"
            user_role = (user_data or {}).get("role", "General")
            today = datetime.now().strftime("%Y-%m-%d")
            schema = SmartQueryService.get_schema_context()
            
            sys_prompt = f"Anda asisten PACS. User: {username} (Role: {user_role}). Hari ini: {today}. DB: READ-ONLY. Schema: {schema}. Instructions: 1. Greet user by name if appropriate. 2. If DB needed, return JSON: {{'action': 'query_database', 'sql': '...'}}. 3. Otherwise JSON: {{'type': 'text', 'content': '...'}}."
            
            api_messages = [{"role": "system", "content": sys_prompt}]
            for m in messages:
                if hasattr(m, "role"): api_messages.append({"role": m.role, "content": m.content})
                elif isinstance(m, dict): api_messages.append(m)

            # --- DECISION ---
            response = client.chat.completions.create(model=settings.ai_model_name, messages=api_messages, response_format={"type": "json_object"})
            res_content = response.choices[0].message.content
            
            res_data = {}
            if res_content and res_content.strip():
                try:
                    res_data = json.loads(AIService._clean_json_response(res_content))
                except Exception as e:
                    logger.warning(f"Failed to parse AI decision JSON: {e}. Content: {res_content}")
                    res_data = {"type": "text", "content": AIService._strip_json_artifacts(res_content)}
            else:
                res_data = {"type": "text", "content": f"Halo {username}! Ada yang bisa saya bantu?"}

            if res_data.get("action") == "query_database":
                # --- ROLE & PERMISSION VALIDATION ---
                allowed_roles = [r.upper() for r in settings.allowed_roles]
                user_role = (user_data or {}).get("role", "").upper()
                
                if user_role not in allowed_roles and user_role != "DEVELOPER":
                    logger.warning(f"Unauthorized DB access attempt by user {username} with role {user_role}")
                    yield "data: " + json.dumps({
                        "type": "content", 
                        "delta": "Maaf, Anda tidak memiliki izin yang cukup untuk mengakses data statistik database secara langsung. Silakan hubungi administrator jika Anda memerlukan akses ini."
                    }) + "\n\n"
                    yield "data: " + json.dumps({"type": "end", "suggestion_chips": ["Bantuan", "Cek Profil"]}) + "\n\n"
                    return

                sql = res_data.get("sql")
                yield "data: " + json.dumps({"type": "status", "content": "Memeriksa database..."}) + "\n\n"
                try:
                    results = SmartQueryService.execute_query(sql)
                    last_msg = messages[-1]
                    last_query_text = last_msg.content if hasattr(last_msg, 'content') else str(last_msg)
                    
                    explain_prompt = [
                        {"role": "system", "content": "Anda asisten PACS. Jelaskan data dalam Bahasa Indonesia TEKS BIASA. DILARANG JSON. DILARANG SARAN."},
                        {"role": "user", "content": f"Data: {json.dumps(results, default=str)}. Pertanyaan: {last_query_text}"}
                    ]
                    stream = client.chat.completions.create(model=settings.ai_model_name, messages=explain_prompt, stream=True)
                    yield "data: " + json.dumps({"type": "start", "message_type": "text"}) + "\n\n"
                    for chunk in stream:
                        if chunk.choices and chunk.choices[0].delta.content:
                            yield "data: " + json.dumps({"type": "content", "delta": chunk.choices[0].delta.content}) + "\n\n"
                    yield "data: " + json.dumps({"type": "end", "suggestion_chips": ["Cek Detail", "Bantuan"]}) + "\n\n"
                except Exception as e:
                    yield "data: " + json.dumps({"type": "error", "content": f"Kesalahan data: {str(e)}"}) + "\n\n"
            else:
                yield "data: " + json.dumps({"type": "start", "message_type": "text"}) + "\n\n"
                content = res_data.get("content", f"Halo {username}!")
                words = content.split(" ")
                for i, word in enumerate(words):
                    delta = word + (" " if i < len(words)-1 else "")
                    yield "data: " + json.dumps({"type": "content", "delta": delta}) + "\n\n"
                    await asyncio.sleep(0.01)
                yield "data: " + json.dumps({"type": "end", "suggestion_chips": ["Cari Pasien", "Bantuan"]}) + "\n\n"

        except Exception as e:
            logger.error(f"Stream error: {e}")
            yield "data: " + json.dumps({"type": "error", "content": "Maaf, terjadi gangguan pada sistem."}) + "\n\n"

    @staticmethod
    def chat_flexible(messages: List[Dict[str, str]], context_data: Dict = None, user_data: Dict = None) -> Dict[str, Any]:
        client = AIService._get_openai_client()
        if not client: return {"type": "text", "content": "Error"}
        try:
            today = datetime.now().strftime("%Y-%m-%d")
            username = (user_data or {}).get("full_name") or (user_data or {}).get("username") or "User"
            user_role = (user_data or {}).get("role", "General")
            schema = SmartQueryService.get_schema_context()
            sys_prompt = f"PACS Assistant. User: {username} (Role: {user_role}). Today: {today}. Schema: {schema}. Return JSON."
            api_messages = [{"role": "system", "content": sys_prompt}]
            for m in messages:
                if isinstance(m, dict): api_messages.append(m)
                else: api_messages.append({"role": m.role, "content": m.content})
            response = client.chat.completions.create(model=settings.ai_model_name, messages=api_messages, response_format={"type": "json_object"})
            res_data = json.loads(AIService._clean_json_response(response.choices[0].message.content))
            if res_data.get("action") == "query_database":
                # --- ROLE VALIDATION ---
                allowed_roles = [r.upper() for r in settings.allowed_roles]
                user_role = (user_data or {}).get("role", "").upper()
                if user_role not in allowed_roles and user_role != "DEVELOPER":
                    return {
                        "type": "text", 
                        "content": "Maaf, Anda tidak memiliki izin untuk mengakses data database. Akses ini dibatasi untuk administrator.",
                        "suggestion_chips": ["Bantuan"]
                    }

                results = SmartQueryService.execute_query(res_data.get("sql"))
                follow_up = [{"role": "system", "content": "Results: " + json.dumps(results, default=str) + ". Explain in Indonesian JSON."}]
                final = client.chat.completions.create(model=settings.ai_model_name, messages=follow_up, response_format={"type": "json_object"})
                return json.loads(AIService._clean_json_response(final.choices[0].message.content))
            return res_data
        except Exception: return {"type": "text", "content": "Maaf, ada kendala."}

    @staticmethod
    def chat_analytics(query: str, context_data: Dict = None, user_data: Dict = None) -> Dict[str, Any]:
        client = AIService._get_openai_client()
        if not client: return {"type": "text", "content": "Error"}
        try:
            res = client.chat.completions.create(model=settings.ai_model_name, messages=[{"role": "user", "content": f"Analyze: {query}. Return JSON."}], response_format={"type": "json_object"})
            return json.loads(AIService._clean_json_response(res.choices[0].message.content))
        except Exception: return {"type": "text", "content": "Error"}
