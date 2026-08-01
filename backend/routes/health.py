"""
Health & Diagnostics Router
"""

import sys
import time
import logging
from datetime import datetime
from fastapi import APIRouter
from resource_load import _get_sb

logger = logging.getLogger("stelix")
router = APIRouter(tags=["Health & Diagnostics"])


@router.get("/")
async def root():
    """Welcome root endpoint."""
    return {
        "status": "online",
        "service": "Stelix Healthcare AI Platform API",
        "version": "2.0.0",
        "timestamp": datetime.now().isoformat(),
    }


@router.get("/health")
async def health_check():
    """
    Comprehensive system health check endpoint.
    Verifies service state and database connectivity.
    """
    db_status = "healthy"
    try:
        sb = _get_sb()
        sb.table("patients").select("id").limit(1).execute()
    except Exception as e:
        logger.warning(f"Database health check warning: {e}")
        db_status = "degraded"

    return {
        "status": "ok",
        "database": db_status,
        "python_version": sys.version.split()[0],
        "server_time": time.time(),
        "timestamp": datetime.now().isoformat(),
    }
