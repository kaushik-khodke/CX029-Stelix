import asyncio
from elevenlabs.client import AsyncElevenLabs

async def test():
    try:
        from elevenlabs.conversational_ai.client import ConversationalAiClient
        print("ElevenLabs Outbound Call API is available")
    except ImportError as e:
        print("ElevenLabs error:", str(e))
        import elevenlabs
        print(dir(elevenlabs))

if __name__ == "__main__":
    asyncio.run(test())
