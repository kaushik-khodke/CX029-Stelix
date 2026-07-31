"""
health_agent.py
Wraps RAGService + ML engine for the logged-in patient's health records.
All records are scoped to the resolved patient_id.
"""
import os
import sys
from typing import Any, Dict, Optional
from supabase import create_client, Client

from agents.base_agent import BaseAgent, AgentResult

# RAG + ML live one level up
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from rag_service import RAGService
from ml_engine import analyze_risk


class HealthAgent(BaseAgent):
    name = "health_agent"
    description = "Searches patient medical records and analyses health risk using ML."

    def __init__(self):
        url = os.getenv("VITE_SUPABASE_URL")
        key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        self.db: Client = create_client(url, key)
        self.rag = RAGService(supabase_url=url, supabase_key=key)

    def _resolve_patient_id(self, user_id: str) -> Optional[str]:
        res = (
            self.db.table("patients")
            .select("id")
            .eq("user_id", user_id)
            .maybe_single()
            .execute()
        )
        if not res or not getattr(res, 'data', None):
            try:
                new_pt = self.db.table("patients").insert({
                    "user_id": user_id,
                    "full_name": "New Patient",
                    "phone": "+10000000000"
                }).execute()
                return new_pt.data[0]["id"]
            except Exception as e:
                print("Failed to auto-create patient:", e)
                return None
        return res.data["id"]

    async def run(self, task: str, context: Dict[str, Any]) -> AgentResult:
        user_id = context.get("user_id")
        action  = context.get("action", "search")   # "search" | "analyze"

        patient_id = self._resolve_patient_id(user_id) if user_id else None
        if not patient_id:
            return AgentResult(success=False, agent_name=self.name,
                               message="Could not find patient record.")

        if action == "search":
            query = context.get("query", task)
            try:
                context_text = await self.rag.search_records(user_id=user_id, query=query)
            except Exception as e:
                return AgentResult(success=False, agent_name=self.name,
                                   message=f"Record search failed: {e}")
            if not context_text:
                return AgentResult(success=True, data=None, agent_name=self.name,
                                   message="No relevant medical records found for this query.")
            return AgentResult(success=True, data={"context": context_text},
                               agent_name=self.name,
                               message=f"Found relevant records:\n{context_text[:500]}")

        if action == "analyze":
            try:
                # Resolve auth_uid for RAG
                records = await self.rag.get_patient_records(user_id)
                result  = analyze_risk(records)

                # Fetch recent routines to enrich analysis
                from datetime import datetime, timedelta
                week_ago = (datetime.utcnow() - timedelta(days=7)).isoformat()
                routines_res = self.db.table("health_routines") \
                    .select("metric_type, value") \
                    .eq("user_id", user_id) \
                    .gte("logged_at", week_ago) \
                    .execute()
                
                routines = routines_res.data or []
                summary = {}
                for r in routines:
                    m = r["metric_type"]
                    if m not in summary: summary[m] = []
                    try:
                        summary[m].append(float(r["value"]))
                    except: pass
                
                routine_text = ""
                if summary:
                    routine_text = " Recent lifestyle context: " + ", ".join([
                        f"Avg {k}: {round(sum(v)/len(v), 1)}" for k,v in summary.items()
                    ])
                
                result["lifestyle_context"] = routine_text
            except Exception as e:
                return AgentResult(success=False, agent_name=self.name,
                                   message=f"Health analysis failed: {e}")
            return AgentResult(
                success=True,
                data=result,
                agent_name=self.name,
                message=f"Risk level: **{result.get('risk_level', 'Unknown')}**. Vitals detected: {result.get('vitals_detected')}. {result.get('lifestyle_context', '')}",
            )

        if action == "get_routines":
            try:
                from datetime import datetime, timedelta
                week_ago = (datetime.utcnow() - timedelta(days=7)).isoformat()
                res = self.db.table("health_routines") \
                    .select("metric_type, value, logged_at") \
                    .eq("user_id", user_id) \
                    .gte("logged_at", week_ago) \
                    .order("logged_at", desc=True) \
                    .execute()
                
                data = res.data or []
                if not data:
                    return AgentResult(success=True, data=[], agent_name=self.name,
                                       message="No health routine data found for the last 7 days.")
                
                return AgentResult(success=True, data=data, agent_name=self.name,
                                   message=f"Retrieved {len(data)} routine logs from the last 7 days.")
            except Exception as e:
                return AgentResult(success=False, agent_name=self.name,
                                   message=f"Failed to fetch routines: {e}")


        return AgentResult(success=False, agent_name=self.name,
                           message=f"Unknown action: {action}")
