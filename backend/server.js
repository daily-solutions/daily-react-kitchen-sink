const express = require('express');
const dotenv = require('dotenv');
const path = require('path');
const { ElevenLabsClient } = require('elevenlabs');
const { createWriteStream } = require('fs');
const { v4: uuid } = require('uuid');

const model_id = "eleven_turbo_v2";
const voice = "Rachel";

dotenv.config();

const app = express();
const port = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
if (!ELEVENLABS_API_KEY) {
    throw new Error("Missing ELEVENLABS_API_KEY in environment variables");
}

const client = new ElevenLabsClient({
    apiKey: ELEVENLABS_API_KEY,
});

const createAudioStreamFromText = async (text) => {
    const audioStream = await client.generate({
        voice,
        model_id,
        text,
    });

    return audioStream;
};

app.post('/api/speech', async (req, res) => {
    const { text } = req.body;

    try {
        const audioStream = await createAudioStreamFromText(text);

        res.setHeader('Content-Type', 'audio/mpeg');

        for await (const chunk of audioStream) {
            res.write(chunk);
        }

        res.end();
    } catch (error) {
        console.error('Error fetching speech audio:', error);
        res.status(500).json({ error: 'Failed to fetch speech audio' });
    }
});

app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});