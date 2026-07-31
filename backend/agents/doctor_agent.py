import os
from typing import Any, Dict, Optional
from datetime import datetime, timezone
from supabase import create_client, Client

from agents.base_agent import BaseAgent, AgentResult

class DoctorAgent(BaseAgent):
    name = "doctor_agent"
    description = (
        "Handles doctor workflows like accepting or rejecting ward assignments, "
        "checking their current schedule, or inquiring about ward status."
    )

    def __init__(self):
        url = os.getenv("VITE_SUPABASE_URL")
        key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        self.db: Client = create_client(url, key)

    async def _get_doctor_id(self, user_id: str) -> Optional[str]:
        res = self.db.table("doctors").select("id").eq("user_id", user_id).maybe_single().execute()
        return res.data["id"] if res.data else None

    async def update_assignment(self, user_id: str, status: str, assignment_id: Optional[str] = None, ward: Optional[str] = None) -> AgentResult:
        """Updates the status of a specific assignment by ID or Ward name."""
        try:
            doctor_id = await self._get_doctor_id(user_id)
            
            # If no assignment_id but ward name is given, try to resolve it
            if not assignment_id and ward:
                pending = self.db.table("doctor_assignments").select("id, ward").eq("doctor_id", doctor_id).eq("status", "pending").execute()
                for p in (pending.data or []):
                    if ward.lower() in p["ward"].lower():
                        assignment_id = p["id"]
                        break
            
            if not assignment_id:
                return AgentResult(success=False, agent_name=self.name, message="I couldn't identify which assignment you mean. Could you provide the ID or the exact ward name?")

            check = self.db.table("doctor_assignments").select("doctor_id, status").eq("id", assignment_id).maybe_single().execute()
            
            if not check.data or check.data["doctor_id"] != doctor_id:
                return AgentResult(success=False, agent_name=self.name, message="Assignment not found or unauthorized.")
            
            if check.data["status"] != "pending":
                return AgentResult(success=True, agent_name=self.name, message=f"This assignment was already {check.data['status']}.")

            self.db.table("doctor_assignments").update({
                "status": status,
                "responded_at": datetime.now(timezone.utc).isoformat()
            }).eq("id", assignment_id).execute()

            return AgentResult(success=True, agent_name=self.name, message=f"Successfully marked your assignment at {ward or assignment_id} as {status}.")
        except Exception as e:
            return AgentResult(success=False, agent_name=self.name, message=f"Error updating assignment: {str(e)}")

    async def get_my_assignments(self, user_id: str) -> AgentResult:
        """Fetches all pending assignments for the doctor."""
        try:
            doctor_id = await self._get_doctor_id(user_id)
            res = self.db.table("doctor_assignments").select("*").eq("doctor_id", doctor_id).eq("status", "pending").order("created_at", desc=True).execute()
            
            if not res.data:
                return AgentResult(success=True, data=[], agent_name=self.name, message="You have no pending assignments.")
            
            return AgentResult(success=True, data=res.data, agent_name=self.name, message=f"Found {len(res.data)} pending assignments.")
        except Exception as e:
            return AgentResult(success=False, agent_name=self.name, message=f"Error fetching assignments: {str(e)}")

    async def run(self, task: str, context: Dict[str, Any]) -> AgentResult:
        user_id = context.get("user_id")
        action = context.get("action", "get_assignments") # update_status | get_assignments
        
        if not user_id:
            return AgentResult(success=False, agent_name=self.name, message="No user_id provided in context.")

        if action == "update_status":
            assignment_id = context.get("assignment_id")
            ward = context.get("ward")
            status = context.get("status")
            if not status or (not assignment_id and not ward):
                return AgentResult(success=False, agent_name=self.name, message="Missing status and either assignment_id or ward.")
            return await self.update_assignment(user_id, status, assignment_id, ward)
        
        if action == "get_assignments":
            return await self.get_my_assignments(user_id)

        return AgentResult(success=False, agent_name=self.name, message=f"Unknown action: {action}")
