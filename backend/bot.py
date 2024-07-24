import os
import asyncio
from dotenv import load_dotenv
from pipecat.transports.services.daily import DailyTransport, DailyParams
from pipecat.services.elevenlabs import ElevenLabsTTSService
from pipecat.services.openai import OpenAILLMService
from pipecat.utils import VAD

load_dotenv()


async def main(room_url, token=None):
    transport = DailyTransport(
        api_key=os.getenv('DAILY_API_KEY'),
        room_url=room_url,
        token=token,
        participant_name="Bot",
        params=DailyParams(
            audio_out_enabled=True,
            camera_out_enabled=False,
            transcription_enabled=True,
            vad_enabled=True,
        )
    )
    tts_service = ElevenLabsTTSService(api_key=os.getenv('ELEVENLABS_API_KEY'))
    llm_service = OpenAILLMService(api_key=os.getenv('OPENAI_API_KEY'))
    vad = VAD()

    async def handle_input(input_text):
        response = await llm_service.process(input_text)
        return response

    async def run_pipeline():
        while True:
            user_input = await transport.receive()
            if vad.is_speaking(user_input):
                response = await handle_input(user_input)
                audio_response = await tts_service.text_to_speech(response)
                await transport.send(audio_response)
            await asyncio.sleep(0.1)

    await run_pipeline()

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Daily Bot")
    parser.add_argument("-u", type=str, help="Room URL")
    parser.add_argument("-t", type=str, help="Token")
    config = parser.parse_args()
    asyncio.run(main(config.u, config.t))
