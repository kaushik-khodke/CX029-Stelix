"""
pharmacist_orchestrator.py
Detailed Pharmacist Assistant Orchestrator.
Uses Gemini function-calling to perform global lookups, run SQL queries, 
and resolve patient files dynamically using the sub-agents.
"""
import os
import json
import asyncio
from typing import Any, Dict, List
from google import genai
from google.genai import types
from supabase import create_client, Client

from agents.base_agent import AgentResult
from agents.pharmacy_agent import PharmacyAgent
from agents.refill_agent import RefillAgent
from agents.health_agent import HealthAgent

# ── Tool declarations for Gemini ────────────────────────────────────────────
TOOLS = [
    types.Tool(
        function_declarations=[
            types.FunctionDeclaration(
                name="search_patient",
                description=(
                    "Search for a patient's exact user_id based on their name or partial name. "
                    "Use this first if you need to query their specific medical records or orders."
                ),
                parameters=types.Schema(
                    type="OBJECT",
                    properties={
                        "name_query": types.Schema(type="STRING", description="Patient's name or external ID")
                    },
                    required=["name_query"]
                )
            ),
            types.FunctionDeclaration(
                name="fetch_table_data",
                description=(
                    "Fetch rows from a specified table in the pharmacy database. "
                    "Available tables: "
                    "- audit_logs, consent_requests, doctors, document_chunks, medicines, notification_logs, order_history_raw, order_items, orders, patients, profiles, records, refill_alerts. "
                    "Use this to fetch data and analyze metrics."
                ),
                parameters=types.Schema(
                    type="OBJECT",
                    properties={
                        "table_name": types.Schema(type="STRING", description="Name of the table to fetch"),
                        "select_columns": types.Schema(type="STRING", description="Optional comma-separated list of columns to retrieve. e.g. 'id, status'")
                    },
                    required=["table_name"]
                )
            ),
            types.FunctionDeclaration(
                name="call_pharmacy_agent",
                description="Check inventory or verify a prescription for a specific patient.",
                parameters=types.Schema(
                    type="OBJECT",
                    properties={
                        "action": types.Schema(type="STRING", enum=["search"], description="check inventory"),
                        "query": types.Schema(type="STRING", description="Medicine name"),
                        "user_id": types.Schema(type="STRING", description="Patient user_id (optional, pass if checking prescriptions)")
                    },
                    required=["action", "query"]
                )
            ),
            types.FunctionDeclaration(
                name="call_health_agent",
                description="Search medical records or run ML analysis for a specific patient.",
                parameters=types.Schema(
                    type="OBJECT",
                    properties={
                        "action": types.Schema(type="STRING", enum=["search", "analyze"], description="Search text or run ML risk analysis"),
                        "query": types.Schema(type="STRING", description="Search query text (if action is 'search')"),
                        "user_id": types.Schema(type="STRING", description="Exact Patient user_id (REQUIRED)")
                    },
                    required=["action", "user_id"]
                )
            ),
            types.FunctionDeclaration(
                name="call_refill_agent",
                description="Check refill alerts for a specific patient.",
                parameters=types.Schema(
                    type="OBJECT",
                    properties={
                        "days_ahead": types.Schema(type="INTEGER", description="Days window to check"),
                        "user_id": types.Schema(type="STRING", description="Exact Patient user_id (REQUIRED)")
                    },
                    required=["user_id"]
                )
            )
        ]
    )
]

SYSTEM_PROMPT = """
You are the **Master Pharmacist AI Copilot** — an administrative AI with absolute "God-Mode" access to the entire MyHealthChain pharmacy database.
You assist the Head Pharmacist.

TOOLS AVAILABLE:
1. `search_patient`: Resolve names into UUIDs. (Always do this before looking up records!)
2. `fetch_table_data`: Fetch all records from a given table.
3. `call_pharmacy_agent`: Find medicines in inventory.
4. `call_health_agent` & `call_refill_agent`: Deep dive into a specific patient's medical files.

RULES:
1. **Administrative Persona**: Be extremely concise, highly analytical, and professional. 
2. **Markdown formatting**: Always format data, monetary values, and important identifiers in clean Markdown tables or bulleted lists.
3. **Multi-Agent Chain**: If asked about a user's health ("Why does John Smith need this refill?"): Find John's `user_id` -> run `call_health_agent` on `user_id`.
4. **Data Privacy**: No data is hidden from you. You own the portal.
5. **Internal Reasoning (Chain of Thought)**: You MUST think step-by-step.
"""

from ai_config import get_ai_client, MODEL_TOOL_AGENT, MODEL_TOOL_AGENT_FALLBACK

class PharmacistOrchestratorAgent:
    MAX_HISTORY_TURNS = 6

    def __init__(self):
        url = os.getenv("VITE_SUPABASE_URL")
        key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        self.db: Client = create_client(url, key)
        self.pharmacy = PharmacyAgent()
        self.refill = RefillAgent()
        self.health = HealthAgent()
        self._sessions: Dict[str, List[Dict]] = {}
    
    @property
    def client(self) -> genai.Client:
        return get_ai_client()
    
    def _fetch_table_data(self, table_name: str, select_columns: str = "*") -> AgentResult:
        allowed_tables = [
            "audit_logs", "consent_requests", "doctors", "document_chunks", 
            "medicines", "notification_logs", "order_history_raw", "order_items", 
            "orders", "patients", "profiles", "records", "refill_alerts"
        ]
        if table_name not in allowed_tables:
            return AgentResult(success=False, agent_name="pharmacist_orchestrator", message=f"Table '{table_name}' is not permitted.")
        try:
            actual_select = select_columns if select_columns else "*"
            if table_name == "document_chunks" and actual_select == "*":
                actual_select = "id, record_id, patient_id, content, created_at, updated_at"
            res = self.db.table(table_name).select(actual_select).execute()
            data = res.data or []
            return AgentResult(success=True, data=data, agent_name="pharmacist_orchestrator", message=f"Fetched {len(data)} rows.")
        except Exception as e:
            return AgentResult(success=False, agent_name="pharmacist_orchestrator", message=f"Database Error: {e}")
        
    def _search_patient(self, name_query: str) -> AgentResult:
        res = self.db.table("patients").select("id, user_id, full_name").ilike("full_name", f"%{name_query}%").limit(5).execute()
        data = res.data or []
        if not data:
            return AgentResult(success=False, agent_name="pharmacist_orchestrator", message="No patients found.")
        return AgentResult(success=True, data=data, agent_name="pharmacist_orchestrator", message=f"Found: {data}")

    def _get_history(self, session_id: str) -> List[Dict]:
        return self._sessions.get(session_id, [])

    def _append_history(self, session_id: str, role: str, content: str) -> None:
        if session_id not in self._sessions:
            self._sessions[session_id] = []
        self._sessions[session_id].append({"role": role, "content": content})
        max_msgs = self.MAX_HISTORY_TURNS * 2
        if len(self._sessions[session_id]) > max_msgs:
            self._sessions[session_id] = self._sessions[session_id][-max_msgs:]

    async def _dispatch(self, tool_name: str, args: Dict) -> AgentResult:
        if tool_name == "fetch_table_data":
             return await asyncio.to_thread(self._fetch_table_data, args.get("table_name", ""), args.get("select_columns", "*"))
        if tool_name == "search_patient":
             return await asyncio.to_thread(self._search_patient, args.get("name_query", ""))
        user_id = args.get("user_id", "")
        base_ctx = {"user_id": user_id}
        if tool_name == "call_pharmacy_agent":
            ctx = {**base_ctx, **args}
            return await self.pharmacy.run(args.get("query", ""), ctx)
        if tool_name == "call_refill_agent":
            ctx = {**base_ctx, **args}
            return await self.refill.run("check_refills", ctx)
        if tool_name == "call_health_agent":
            ctx = {**base_ctx, **args}
            return await self.health.run(args.get("query", ""), ctx)
        return AgentResult(success=False, message=f"Unknown tool: {tool_name}", agent_name="pharmacist_orchestrator")

    async def run(self, message: str, language: str = "en") -> Dict[str, Any]:
        session_id = "pharmacist_global_session"
        history = self._get_history(session_id)[-12:]
        
        history_contents = []
        for h in history:
            history_contents.append(types.Content(role=h["role"], parts=[types.Part.from_text(text=h["content"])]))
        
        # Simple stats for prompt injection
        inventory_res = await asyncio.to_thread(self.db.table("medicines").select("name, stock").execute)
        pending_orders_res = await asyncio.to_thread(self.db.table("orders").select("id").eq("status", "pending").execute)
        
        system_injection = f"Total Inventory Items: {len(inventory_res.data or [])}\nTotal Pending Orders: {len(pending_orders_res.data or [])}"
        user_prompt = f"{system_injection}\nLanguage: {language}\nPharmacist: {message}"

        agents_used = ["pharmacist_orchestrator"]
        steps = []
        
        try:
            chat = self.client.chats.create(
                model=MODEL_TOOL_AGENT,
                config=types.GenerateContentConfig(
                    tools=TOOLS,
                    system_instruction=SYSTEM_PROMPT
                ),
                history=history_contents
            )

            # Send initial message with retry for 429 rate limits
            response = None
            for attempt in range(3):
                try:
                    response = await asyncio.to_thread(chat.send_message, user_prompt)
                    break
                except Exception as e:
                    if ("429" in str(e) or "RESOURCE_EXHAUSTED" in str(e)) and attempt < 2:
                        print(f"⏳ Pharmacist Rate limit hit, retrying in 2 seconds (attempt {attempt+1})...")
                        await asyncio.sleep(2)
                    else:
                        raise e

            for _ in range(6):
                if not response or not response.candidates or not response.candidates[0].content.parts:
                    break
                
                parts = response.candidates[0].content.parts
                
                tool_calls = [p.function_call for p in parts if p.function_call]
                for p in parts:
                    if p.text:
                        print(f"💭 {p.text.strip()}")
                        steps.append({"agent": "thought", "message": p.text.strip(), "success": True})

                if not tool_calls:
                    break

                tool_responses = []
                for fc in tool_calls:
                    print(f"🤖 Pharmacist Agent → {fc.name}({fc.args})")
                    result = await self._dispatch(fc.name, fc.args)
                    agents_used.append(result.agent_name)
                    steps.append({"agent": result.agent_name, "message": result.message, "success": result.success})
                    tool_responses.append(
                        types.Part.from_function_response(
                            name=fc.name,
                            response={"result": result.message, "data": result.data}
                        )
                    )
                
                for attempt in range(3):
                    try:
                        response = await asyncio.to_thread(chat.send_message, tool_responses)
                        break
                    except Exception as e:
                        if ("429" in str(e) or "RESOURCE_EXHAUSTED" in str(e)) and attempt < 2:
                            print(f"⏳ Pharmacist Tool turn rate limit hit, retrying in 2 seconds (attempt {attempt+1})...")
                            await asyncio.sleep(2)
                        else:
                            raise e

            final_text = response.text or "I wasn't able to complete that request."
            self._append_history(session_id, "user", message)
            self._append_history(session_id, "model", final_text)

            return {
                "success": True,
                "response": final_text,
                "agents_used": list(set(agents_used)),
                "steps": steps,
            }

        except Exception as e:
            print(f"❌ Pharmacist Orchestrator Error: {e}")
            return {"success": False, "response": "Technical error.", "agents_used": [], "steps": []}
