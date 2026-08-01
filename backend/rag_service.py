from google import genai
from google.genai import types
from supabase import create_client, Client
import requests
import io
import PyPDF2
import os
import sys
import asyncio
from typing import List, Optional
from langfuse.decorators import observe

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
if sys.stderr and hasattr(sys.stderr, "reconfigure"):
    try:
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

from ai_config import safe_generate_content, safe_embed_content, get_ai_client

class RAGService:
    """
    Service for handling Retrieval Augmented Generation (RAG)
    using Supabase vector database
    """
    
    def __init__(self, supabase_url: str, supabase_key: str):
        self.supabase: Client = create_client(supabase_url, supabase_key)
    
    @property
    def client(self) -> genai.Client:
        return get_ai_client()
    
    @observe()
    async def search_records(
        self, 
        user_id: str, 
        query: str,
        match_threshold: float = 0.5,
        match_count: int = 5
    ) -> str:
        """
        Search medical records using vector similarity
        """
        try:
            # Generate embedding for query safely
            res = await safe_embed_content(
                contents=query,
                task_type="RETRIEVAL_QUERY",
                output_dimensionality=768,
                client=self.client
            )
            query_embedding = res.embeddings[0].values
            
            # Search vector database
            response = self.supabase.rpc('match_document_chunks', {
                'query_embedding': query_embedding,
                'match_threshold': match_threshold,
                'match_count': match_count,
                'filter_user_id': user_id
            }).execute()
            
            # Format results
            if response.data:
                context_text = "\n\nRelevant Medical Records:\n"
                for item in response.data:
                    context_text += f"- {item['content']}\n"
                return context_text
            
            return ""
            
        except Exception as e:
            print(f"❌ RAG Search Error: {e}")
            return ""
    
    @observe()
    async def process_document(
        self,
        file_url: str,
        record_id: str,
        patient_id: str,
        chunk_size: int = 500
    ) -> dict:
        """
        Process a PDF document: extract text, create chunks, generate embeddings
        """
        try:
            # Multi-gateway download attempt for IPFS or URLs
            download_urls = [file_url]
            if '/ipfs/' in file_url or 'ipfs://' in file_url or file_url.startswith('Qm') or file_url.startswith('bafy'):
                cid = file_url.split('/ipfs/')[-1].replace('ipfs://', '').strip()
                download_urls = [
                    f"https://ipfs.io/ipfs/{cid}",
                    f"https://gateway.pinata.cloud/ipfs/{cid}",
                    f"https://cloudflare-ipfs.com/ipfs/{cid}",
                    f"https://dweb.link/ipfs/{cid}"
                ]
            
            response = None
            for url in download_urls:
                try:
                    res = requests.get(url, timeout=10)
                    if res.status_code == 200 and len(res.content) > 0:
                        response = res
                        print(f"✅ Successfully downloaded file from: {url}")
                        break
                except Exception as dl_err:
                    print(f"⚠️ Gateway download failed for {url}: {dl_err}")

            full_text = ""
            
            if response and response.content:
                content_type = response.headers.get('Content-Type', '').lower()
                mime_type = 'application/pdf'
                if 'png' in content_type.lower() or file_url.lower().endswith('.png'):
                    mime_type = 'image/png'
                elif 'jpg' in content_type.lower() or 'jpeg' in content_type.lower() or file_url.lower().endswith(('.jpg', '.jpeg')):
                    mime_type = 'image/jpeg'
                
                try:
                    print(f"🖼️ Processing Document via Vision Model (MIME: {mime_type})...")
                    vision_response = await safe_generate_content(
                        contents=[
                            "Extract all the text from this document. If there is handwriting, transcribe it accurately. If there are tables or forms, structure them clearly as text. Return ONLY the extracted text. If no text is found, return an empty string.",
                            types.Part.from_bytes(data=response.content, mime_type=mime_type)
                        ],
                        task_type="text_fast",
                        client=self.client
                    )
                    if vision_response and vision_response.text:
                        full_text = vision_response.text.strip()
                        print(f"✅ Extracted {len(full_text)} characters from document")
                except Exception as ve:
                    print(f"⚠️ AI Vision Extraction warning: {ve}")

            # Fallback to record notes & title if file OCR had no text or download failed
            if not full_text or not full_text.strip():
                try:
                    rec = self.supabase.table("records").select("notes, title").eq("id", record_id).maybe_single().execute()
                    if rec and rec.data:
                        title_str = rec.data.get("title") or "Medical Record"
                        notes_str = rec.data.get("notes") or ""
                        full_text = f"Record Title: {title_str}\nNotes: {notes_str}".strip()
                        print(f"ℹ️ Used record metadata fallback text ({len(full_text)} chars)")
                except Exception as fe:
                    print(f"⚠️ Could not fetch record fallback metadata: {fe}")

            if not full_text or not full_text.strip():
                full_text = f"Medical Record ID {record_id} uploaded on system."
            
            # Save full text to records table in extracted_text column & mark as analyzed
            try:
                self.supabase.table("records").update({
                    "extracted_text": full_text,
                    "encrypted_metadata": {"analyzed": True}
                }).eq("id", record_id).execute()
                print("✅ Saved full text to records.extracted_text column & marked as analyzed")
            except Exception as e:
                print(f"⚠️ Could not save full text: {e}")
            
            # Create chunks
            chunks = [
                full_text[i:i+chunk_size] 
                for i in range(0, len(full_text), chunk_size)
            ]
            
            print(f"📄 Created {len(chunks)} chunks, generating embeddings...")
            
            # Generate embeddings and prepare for batch insert
            rows_to_insert = []
            for chunk in chunks:
                embedding_result = await safe_embed_content(
                    contents=chunk,
                    task_type="RETRIEVAL_DOCUMENT",
                    output_dimensionality=768,
                    client=self.client
                )
                
                rows_to_insert.append({
                    "record_id": record_id,
                    "patient_id": patient_id,
                    "content": chunk,
                    "embedding": embedding_result.embeddings[0].values
                })
            
            # Batch insert to database
            if rows_to_insert:
                self.supabase.table("document_chunks").insert(rows_to_insert).execute()
                print(f"✅ Inserted {len(rows_to_insert)} chunks into database")
            
            return {
                "chunks": len(rows_to_insert),
                "text_length": len(full_text)
            }
            
        except Exception as e:
            print(f"❌ Document Processing Error: {e}")
            raise
    
    def _get_candidate_patient_ids(self, user_id: str) -> List[str]:
        candidate_ids = list(set([user_id])) if user_id else []
        if not user_id:
            return candidate_ids
        try:
            # Query patients table to find both patients.id and patients.user_id
            p_res = self.supabase.table("patients")\
                .select("id, user_id")\
                .or_(f"id.eq.{user_id},user_id.eq.{user_id}")\
                .execute()
            if p_res.data:
                for row in p_res.data:
                    if row.get("id"):
                        candidate_ids.append(str(row["id"]))
                    if row.get("user_id"):
                        candidate_ids.append(str(row["user_id"]))
        except Exception as e:
            print(f"⚠️ Could not resolve candidate IDs for {user_id}: {e}")
        return list(set(candidate_ids))

    async def get_patient_records(self, user_id: str) -> List[str]:
        """
        Get all text records for a patient from both document_chunks and records.extracted_text
        """
        try:
            candidate_ids = self._get_candidate_patient_ids(user_id)
            print(f"🔍 Fetching chunks & records for candidate IDs: {candidate_ids}")
            
            # 1. Fetch from document_chunks
            chunk_res = self.supabase.table('document_chunks')\
                .select('content')\
                .in_('patient_id', candidate_ids)\
                .execute()
            
            chunk_contents = [item['content'] for item in (chunk_res.data or []) if item.get('content')]
            
            # 2. Fetch from records.extracted_text and notes
            rec_res = self.supabase.table('records')\
                .select('extracted_text, notes, title')\
                .in_('patient_id', candidate_ids)\
                .execute()
            
            rec_contents = []
            if rec_res.data:
                for r in rec_res.data:
                    if r.get('extracted_text') and r['extracted_text'].strip():
                        rec_contents.append(r['extracted_text'].strip())
                    elif r.get('notes') and r['notes'].strip():
                        rec_contents.append(f"{r.get('title', 'Record')}: {r['notes'].strip()}")

            all_records = list(dict.fromkeys(chunk_contents + rec_contents))
            if all_records:
                print(f"✅ Found {len(all_records)} total records/chunks for AI analysis")
                return all_records
            
            print("❌ No records found at all for candidate IDs")
            return []
            
        except Exception as e:
            print(f"❌ Error fetching patient records: {e}")
            return []

    async def get_patient_records_with_dates(self, user_id: str) -> List[dict]:
        try:
            candidate_ids = self._get_candidate_patient_ids(user_id)
            response = self.supabase.table('records')\
                .select('created_at, extracted_text')\
                .in_('patient_id', candidate_ids)\
                .order('created_at', desc=False)\
                .execute()
            
            if response.data:
                return [
                    {
                        "date": item['created_at'], 
                        "text": item['extracted_text']
                    } 
                    for item in response.data 
                    if item.get('extracted_text')
                ]
            
            return []
            
        except Exception as e:
            print(f"❌ Error fetching patient records with dates: {e}")
            return []