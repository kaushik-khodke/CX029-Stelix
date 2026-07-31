import httpx
import asyncio

async def main():
    try:
        print("Fetching /available-medicines...")
        async with httpx.AsyncClient() as client:
            resp = await client.get("http://localhost:8000/available-medicines", timeout=5.0)
            print("Status:", resp.status_code)
            print("Response:", resp.json())
    except Exception as e:
        print("Error:", repr(e))

asyncio.run(main())
