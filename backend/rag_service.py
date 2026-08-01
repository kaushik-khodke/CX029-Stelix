from google import genai
from google.genai import types
from supabase import create_client, Client
import requests
import io
import PyPDF2
import os
import asyncio
from typing import List, Optional
from langfuse.decorators import observe

from ai_config import safe_generate_content, get_ai_client

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
            # Generate embedding for query
            res = await asyncio.to_thread(
                self.client.models.embed_content,
                model="text-embedding-004",
                contents=query,
                config=types.EmbedContentConfig(
                    task_type="RETRIEVAL_QUERY",
                    output_dimensionality=768
                )
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
            print(f"📥 Downloading file from: {file_url}")
            
            # Download file
            response = requests.get(file_url)
            response.raise_for_status()
            content_type = response.headers.get('Content-Type', '').lower()
            
            full_text = ""
            
            if 'pdf' in content_type.lower() or 'image/' in content_type or file_url.lower().endswith(('.png', '.jpg', '.jpeg', '.pdf')):
                print(f"🖼️ Processing Document via Vision Model (MIME: {content_type})...")
                mime_type = 'application/pdf'
                if 'png' in content_type.lower() or file_url.lower().endswith('.png'):
                    mime_type = 'image/png'
                elif 'jpg' in content_type.lower() or 'jpeg' in content_type.lower() or file_url.lower().endswith(('.jpg', '.jpeg')):
                    mime_type = 'image/jpeg'
                
                try:
                    vision_response = await safe_generate_content(
                        contents=[
                            "Extract all the text from this document. If there is handwriting, transcribe it accurately. If there are tables or forms, structure them clearly as text. Return ONLY the extracted text. If no text is found, return an empty string.",
                            types.Part.from_bytes(data=response.content, mime_type=mime_type)
                        ],
                        task_type="text_fast",
                        client=self.client
                    )
                    full_text = vision_response.text
                    print(f"✅ Extracted {len(full_text)} characters from document")
                except Exception as ve:
                    print(f"❌ AI Extraction failed: {ve}")
                    raise ValueError(f"AI Document Extraction failed: {ve}")
            else:
                raise ValueError(f"Unsupported file type: {content_type}")
            
            if not full_text or not full_text.strip():
                raise ValueError("Could not extract any text from the file")
            
            # Save full text to records table
            try:
                self.supabase.table("records").update({
                    "extracted_text": full_text
                }).eq("id", record_id).execute()
                print("✅ Saved full text to records table")
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
                embedding_result = await asyncio.to_thread(
                    self.client.models.embed_content,
                    model="text-embedding-004",
                    contents=chunk,
                    config=types.EmbedContentConfig(
                        task_type="RETRIEVAL_DOCUMENT",
                        output_dimensionality=768
                    )
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
        Get all text records for a patient
        """
        try:
            candidate_ids = self._get_candidate_patient_ids(user_id)
            print(f"🔍 Fetching chunks for candidate IDs: {candidate_ids}")
            
            response = self.supabase.table('document_chunks')\
                .select('content')\
                .in_('patient_id', candidate_ids)\
                .execute()
            
            if response.data:
                contents = [item['content'] for item in response.data if item.get('content')]
                if contents:
                    print(f"✅ Found {len(contents)} chunks in document_chunks")
                    return contents
            
            print("⚠️ No chunks found in document_chunks, checking records table fallback...")
            
            # Fallback to records.extracted_text
            fallback = self.supabase.table('records')\
                .select('extracted_text')\
                .in_('patient_id', candidate_ids)\
                .execute()
            
            if fallback.data:
                records = [r['extracted_text'] for r in fallback.data if r.get('extracted_text')]
                print(f"✅ Found {len(records)} records in fallback")
                return records
            
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