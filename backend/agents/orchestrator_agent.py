"""
orchestrator_agent.py
The brain: receives the user message, uses Gemini function-calling to decide
which specialist agents to call (and in what order), then synthesises a final reply.

User isolation is enforced by passing user_id in every sub-agent context.
"""
import os
import json
import asyncio
from typing import Any, Dict, List, Optional
from google import genai
from google.genai import types

from agents.base_agent import AgentResult
from agents.pharmacy_agent import PharmacyAgent
from agents.refill_agent import RefillAgent
from agents.notification_agent import NotificationAgent
from agents.health_agent import HealthAgent
from agents.prescription_agent import PrescriptionAgent
from agents.safety_agent import SafetyAgent
from agents.doctor_agent import DoctorAgent


# ── Tool declarations for Gemini ────────────────────────────────────────────
TOOLS = [
    types.Tool(
        function_declarations=[
            types.FunctionDeclaration(
                name="call_pharmacy_agent",
                description=(
                    "Search medicines, check prescription requirement in database, place orders, or check current medications. "
                    "ALWAYS call this tool first when a user asks to buy, order, refill, or check any medicine. "
                    "Use action='order' to purchase a medicine (it will automatically check database if a prescription is required). "
                    "Use action='search' to look up a medicine. "
                    "Use action='get_my_medicines' to see the patient's currently prescribed medications and dosages. "
                    "Use action='order_from_prescription' to bulk order from an uploaded record."
                ),
                parameters=types.Schema(
                    type="OBJECT",
                    properties={
                        "action": types.Schema(type="STRING", enum=["search", "order", "order_from_prescription", "get_my_medicines"], description="search, order, order_from_prescription, or get_my_medicines"),
                        "query":  types.Schema(type="STRING", description="Medicine name or search query"),
                        "qty":    types.Schema(type="INTEGER", description="Number of units to order"),
                    },
                    required=["action"],
                ),
            ),
            types.FunctionDeclaration(
                name="call_refill_agent",
                description=(
                    "Check which of the patient's medicines are running out soon. "
                ),
                parameters=types.Schema(
                    type="OBJECT",
                    properties={
                        "days_ahead": types.Schema(type="INTEGER", description="Days window to check"),
                    },
                ),
            ),
            types.FunctionDeclaration(
                name="call_notification_agent",
                description="Log a notification (order confirmation, refill alert) for the patient.",
                parameters=types.Schema(
                    type="OBJECT",
                    properties={
                        "type":    types.Schema(type="STRING", description="e.g. order_confirmation, refill_alert"),
                        "channel": types.Schema(type="STRING", description="app, email, sms"),
                        "payload": types.Schema(type="OBJECT", description="Notification details"),
                    },
                    required=["type"],
                ),
            ),
            types.FunctionDeclaration(
                name="call_health_agent",
                description="Search medical records, run health analysis, or check daily routines (steps, hydration, sleep).",
                parameters=types.Schema(
                    type="OBJECT",
                    properties={
                        "action": types.Schema(type="STRING", enum=["search", "analyze", "get_routines"], description="search, analyze, or get_routines"),
                        "query":  types.Schema(type="STRING", description="Search query"),
                    },
                    required=["action"],
                ),
            ),
            types.FunctionDeclaration(
                name="call_prescription_agent",
                description="Verify if a patient has a valid prescription for a medicine in their uploaded records.",
                parameters=types.Schema(
                    type="OBJECT",
                    properties={
                        "medicine_name": types.Schema(type="STRING", description="Medicine to verify"),
                    },
                    required=["medicine_name"],
                ),
            ),
            types.FunctionDeclaration(
                name="call_doctor_agent",
                description=(
                    "Handle doctor workflows: manage ward assignments, accept/reject shifts, "
                    "or check the doctor's current pending assignments. "
                    "You can update status using the ward name (e.g. 'Emergency') if you don't have the ID. "
                    "Use action='get_assignments' to see pending duties. "
                    "Use action='update_status' to confirm (status='accepted') or decline (status='rejected') an assignment."
                ),
                parameters=types.Schema(
                    type="OBJECT",
                    properties={
                        "action": types.Schema(type="STRING", enum=["get_assignments", "update_status"], description="get_assignments or update_status"),
                        "assignment_id": types.Schema(type="STRING", description="UUID of the assignment (optional if ward provided)"),
                        "ward": types.Schema(type="STRING", description="Name of the ward (optional if assignment_id provided)"),
                        "status": types.Schema(type="STRING", enum=["accepted", "rejected"], description="accepted or rejected"),
                    },
                    required=["action"],
                ),
            ),
        ]
    )
]


SYSTEM_PROMPT = """
You are the **MyHealthChain Master AI Agent** — a senior healthcare assistant that coordinates specialist sub-agents.
You serve both **Patients** and **Doctors**.

ROLE AWARENESS:
1. If User role is **patient**: Focus on their health records, routines, and medications.
2. If User role is **doctor**: Assist with hospital duties, ward assignments, and patient management.

TOOLS AVAILABLE:
• call_pharmacy_agent     — search/order medicines, check inventory, create order drafts
• call_prescription_agent — verify patient's uploaded prescriptions in medical records
• call_refill_agent       — detect which medicines are running low
• call_notification_agent — log confirmations
• call_health_agent       — search records, analyze risk, or check daily routines
• call_doctor_agent       — manage ward assignments or check duties (ONLY for doctors)

CRITICAL WORKFLOW RULES FOR MEDICINES & ORDERS:
1. **Always Check Database First**: When a patient asks to order, buy, or query ANY medicine (e.g., "order paracetamol"), ALWAYS call `call_pharmacy_agent` (action='order' or action='search') FIRST.
2. **Prescription Verification**: NEVER ask the patient for a prescription or assume a prescription is required before calling `call_pharmacy_agent`. `call_pharmacy_agent` automatically checks the database (`medicines.prescription_required`) to see if a prescription is actually needed.
3. **Over-The-Counter (OTC) Medicines**: If a medicine does NOT require a prescription in the database (such as Paracetamol/Acetaminophen, Ibuprofen, Vitamin C, etc.), `call_pharmacy_agent` will immediately generate the order draft and payment checkout link.
4. **Prescription-Required Medicines**: Only if the database indicates `prescription_required = true` for that medicine will the system check the user's uploaded records or ask for a prescription.
5. **ALWAYS INCLUDE PAYMENT LINKS IN YOUR FINAL RESPONSE**: When `call_pharmacy_agent` creates an order draft and returns a payment checkout URL (e.g. `[Pay for Order](...)` or `checkout_url`), you MUST include the exact clickable markdown link `[Pay for Order](checkout_url)` directly in your final response to the user. NEVER omit, rephrase, or describe the payment link without providing the actual clickable link string!

GENERAL RULES:
1. **Context Alignment**: If a doctor asks about their duties, use `call_doctor_agent`. If a patient asks about their health, use `call_health_agent`.
2. **Chain of Thought**: Express your reasoning before calling tools.
3. **Persona**: Be professional, clinical, and helpful. Use emojis.
"""



from ai_config import get_ai_client, MODEL_TOOL_AGENT, MODEL_TOOL_AGENT_FALLBACK

class OrchestratorAgent:
    MAX_HISTORY_TURNS = 6

    def __init__(self):
        self.pharmacy     = PharmacyAgent()
        self.refill       = RefillAgent()
        self.notification = NotificationAgent()
        self.health       = HealthAgent()
        self.prescription = PrescriptionAgent()
        self.safety       = SafetyAgent()
        self.doctor       = DoctorAgent()
        self._sessions: Dict[str, List[Dict]] = {}

    @property
    def client(self) -> genai.Client:
        return get_ai_client()

    def _get_history(self, user_id: str) -> List[Dict]:
        return self._sessions.get(user_id, [])

    def _append_history(self, user_id: str, role: str, content: str) -> None:
        if user_id not in self._sessions:
            self._sessions[user_id] = []
        self._sessions[user_id].append({"role": role, "content": content})
        max_msgs = self.MAX_HISTORY_TURNS * 2
        if len(self._sessions[user_id]) > max_msgs:
            self._sessions[user_id] = self._sessions[user_id][-max_msgs:]

    async def _dispatch(self, tool_name: str, args: Dict, user_id: str) -> AgentResult:
        base_ctx = {"user_id": user_id}
        if tool_name == "call_pharmacy_agent":
            ctx = {**base_ctx, **args}
            return await self.pharmacy.run(args.get("query", ""), ctx)
        if tool_name == "call_refill_agent":
            ctx = {**base_ctx, "days_ahead": args.get("days_ahead", 7)}
            return await self.refill.run("check_refills", ctx)
        if tool_name == "call_notification_agent":
            ctx = {**base_ctx, **args}
            return await self.notification.run("log", ctx)
        if tool_name == "call_health_agent":
            ctx = {**base_ctx, **args}
            return await self.health.run(args.get("query", ""), ctx)
        if tool_name == "call_prescription_agent":
            ctx = {**base_ctx, **args}
            return await self.prescription.run(args.get("medicine_name", ""), ctx)
        if tool_name == "call_doctor_agent":
            ctx = {**base_ctx, **args}
            return await self.doctor.run(args.get("action", ""), ctx)
        return AgentResult(success=False, message=f"Unknown tool: {tool_name}", agent_name="orchestrator")

    async def run(self, message: str, user_id: str, language: str = "en", role: str = "patient") -> Dict[str, Any]:
        print(f"DEBUG: Orchestrator.run - Role: {role}, User: {user_id}, Msg: {message}")
        safety_check = await self.safety.run(message)
        if not safety_check.success:
            return {"success": False, "response": safety_check.message, "agents_used": ["safety_agent"], "steps": []}

        # Format message content including recent history (last 6 chats = 12 messages)
        history = self._get_history(user_id)[-12:]
        history_contents = []
        for h in history:
            history_contents.append(types.Content(role=h["role"], parts=[types.Part.from_text(text=h["content"])]))
        
        user_prompt = f"User role: {role}\nUser ID: {user_id}\nLanguage: {language}\nUser message: {message}"

        agents_used = []
        steps = []
        checkout_url = None
        
        try:
            models_to_try = [MODEL_TOOL_AGENT, MODEL_TOOL_AGENT_FALLBACK, "gemini-2.0-flash-lite"]
            chat = None
            response = None
            last_err = None

            for model_name in models_to_try:
                try:
                    chat = self.client.chats.create(
                        model=model_name,
                        config=types.GenerateContentConfig(
                            tools=TOOLS,
                            system_instruction=SYSTEM_PROMPT
                        ),
                        history=history_contents
                    )
                    for attempt in range(3):
                        try:
                            response = await asyncio.to_thread(chat.send_message, user_prompt)
                            break
                        except Exception as e:
                            if ("429" in str(e) or "RESOURCE_EXHAUSTED" in str(e) or "quota" in str(e).lower()) and attempt < 2:
                                print(f"⏳ [{model_name}] Rate limit hit, retrying in 1s (attempt {attempt+1})...")
                                await asyncio.sleep(1)
                            else:
                                raise e
                    if response:
                        break
                except Exception as me:
                    last_err = me
                    if "429" in str(me) or "RESOURCE_EXHAUSTED" in str(me) or "quota" in str(me).lower() or "404" in str(me):
                        print(f"⚠️ Model {model_name} quota/error: {str(me)[:100]}. Trying fallback model...")
                        continue
                    else:
                        raise me

            if not response and last_err:
                raise last_err

            for _ in range(6): # max tool iterations
                if not response or not response.candidates or not response.candidates[0].content.parts:
                    break
                
                parts = response.candidates[0].content.parts
                
                tool_calls = [p.function_call for p in parts if p.function_call]
                
                # Log thoughts
                for p in parts:
                    if p.text:
                        print(f"💭 {p.text.strip()}")
                        steps.append({"agent": "thought", "message": p.text.strip(), "success": True})

                if not tool_calls:
                    break

                tool_responses = []
                for fc in tool_calls:
                    print(f"🤖 Orchestrator → {fc.name}({fc.args})")
                    result = await self._dispatch(fc.name, fc.args, user_id)
                    agents_used.append(result.agent_name)
                    steps.append({"agent": result.agent_name, "message": result.message, "success": result.success})
                    
                    # Capture payment checkout URL if present
                    if isinstance(result.data, dict) and result.data.get("checkout_url"):
                        checkout_url = result.data.get("checkout_url")
                    elif result.message and "[Pay for Order](" in result.message:
                        import re
                        match = re.search(r'\[Pay for Order\]\(([^)]+)\)', result.message)
                        if match:
                            checkout_url = match.group(1)

                    tool_responses.append(
                        types.Part.from_function_response(
                            name=fc.name,
                            response={"result": result.message, "data": result.data}
                        )
                    )
                
                # Send tool responses back to model as list of Part objects with retry
                for attempt in range(3):
                    try:
                        response = await asyncio.to_thread(chat.send_message, tool_responses)
                        break
                    except Exception as e:
                        if ("429" in str(e) or "RESOURCE_EXHAUSTED" in str(e) or "quota" in str(e).lower()) and attempt < 2:
                            print(f"⏳ Tool turn rate limit hit, retrying in 1s (attempt {attempt+1})...")
                            await asyncio.sleep(1)
                        else:
                            raise e

            final_text = response.text or "I couldn't process that request."
            
            # Guarantee that payment checkout URL is present in final text if created
            if checkout_url and checkout_url not in final_text and "[Pay for Order]" not in final_text:
                final_text += f"\n\n💳 **Click here to complete your payment:**\n[Pay for Order]({checkout_url})"

            self._append_history(user_id, "user", message)
            self._append_history(user_id, "model", final_text)

            return {
                "success": True,
                "response": final_text,
                "agents_used": list(set(agents_used)),
                "steps": steps,
            }

        except Exception as e:
            print(f"❌ Orchestrator Error: {e}")
            import traceback; traceback.print_exc()
            error_str = str(e)
            # Provide user-friendly messages for common errors
            if "suspended" in error_str.lower() or "PERMISSION_DENIED" in error_str or "API_KEY_INVALID" in error_str or "invalid_api_key" in error_str.lower() or "401" in error_str or "403" in error_str:
                user_msg = "⚠️ The Gemini API key has been suspended or invalidated in Google AI Studio. Please generate a fresh key at https://aistudio.google.com/app/apikey and update your .env file."
            elif "429" in error_str or "RESOURCE_EXHAUSTED" in error_str or "quota" in error_str.lower():
                user_msg = "⏳ AI service is busy. Please wait a moment and try again."
            elif "UNAVAILABLE" in error_str or "503" in error_str or "ConnectionError" in error_str:
                user_msg = "🔌 AI service is temporarily unavailable. Please try again shortly."
            else:
                user_msg = f"⚠️ Something went wrong: {error_str[:200]}"
            return {"success": False, "response": user_msg, "agents_used": [], "steps": [], "error": error_str}
