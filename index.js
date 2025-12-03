import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import Groq from 'groq-sdk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pipeline } from '@xenova/transformers';

let embedder = null;

async function getEmbedder() {
  if (!embedder) {
    console.log("Loading embedding model...");
    embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  return embedder;
}

async function computeEmbedding(text) {
  const extractor = await getEmbedder();
  const output = await extractor(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const DB_PATH = path.join(__dirname, 'vector-store.json');

// Load or init the vector store
function loadDb() {
  if (!fs.existsSync(DB_PATH)) return [];
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
}

function saveDb(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

/** Cosine similarity */
function cosineSim(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-8);
}

/** Very naive chunking */
function chunkText(text, maxChars = 500) {
  const chunks = [];
  let current = '';

  for (const line of text.split('\n')) {
    if ((current + '\n' + line).length > maxChars) {
      if (current.trim()) chunks.push(current.trim());
      current = line;
    } else {
      current += '\n' + line;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

/** POST /api/docs
 *  body: { text: string, source?: string }
 */
app.post('/api/docs', async (req, res) => {
  try {
    const { text, source = 'manual' } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'text is required' });
    }

    const chunks = chunkText(text);
    console.log(`Indexing ${chunks.length} chunks...`);

    
    const vectors = [];
    for (let i = 0; i < chunks.length; i++) {
      const embedding = await computeEmbedding(chunks[i]);
      vectors.push({
        id: Date.now() + '-' + i,
        text: chunks[i],
        source,
        embedding
      });
    }
    
    const db = loadDb();
    db.push(...vectors);
    saveDb(db);

    res.json({ inserted: vectors.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to index document' });
  }
});

/** POST /api/chat
 *  body: { question: string, topK?: number }
 */
app.post('/api/chat', async (req, res) => {
  try {
    const { question, topK = 5 } = req.body;
    if (!question || !question.trim()) {
      return res.status(400).json({ error: 'question is required' });
    }

    const db = loadDb();
    if (!db.length) {
      return res.status(400).json({ error: 'No documents indexed yet' });
    }

    // Embed question
    const qEmbedding = await computeEmbedding(question);


    // Similarity search
    const scored = db
      .map((item) => ({
        ...item,
        score: cosineSim(qEmbedding, item.embedding)
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    const contextText = scored.map((s, i) => `Chunk ${i + 1}:\n${s.text}`).join('\n\n');

    /**
     * Creates a chat completion using the specified model and messages.
     *
     * @async
     * @function createChatCompletion
     * @param {string} model - The model to be used for generating completions.
     * @param {Array<Object>} messages - An array of message objects containing role and content.
     * @param {Object} messages[].role - The role of the message sender (e.g., 'system', 'user').
     * @param {string} messages[].content - The content of the message.
     * @returns {Promise<Object>} The completion response from the chat model.
     * @throws {Error} Throws an error if the completion creation fails.
     */
    const completion = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [
        {
          role: 'system',
          content:
            'You are an advanced AI assistant. Your task is to provide accurate and concise answers based on the provided context. If the answer is not present in the context, clearly state that you do not have enough information to answer.you may include html tags to well format your answer(note : use <br/> to return to line instead of \\n).'
        },
        {
          role: 'user',
          content:
            `Context:\n${contextText}\n\nQuestion: ${question}\n\nPlease provide a detailed answer, referencing specific parts of the context when applicable, and ensure clarity and precision in your response.`
        }
      ]
    });

    const answer = completion.choices[0].message.content;

    res.json({
      answer,
      chunks: scored.map(({ id, text, source, score }) => ({
        id,
        text,
        source,
        score
      }))
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to process chat', details: err.message });
  }
});

app.delete('/api/docs/:source', (req, res) => {
  try {
    const source = decodeURIComponent(req.params.source || '').trim();
    if (!source) {
      return res.status(400).json({ error: 'source is required' });
    }

    const db = loadDb();
    const before = db.length;
    const filtered = db.filter(item => item.source !== source);
    const removed = before - filtered.length;

    if (removed === 0) {
      return res.status(404).json({ error: 'No vectors found for source', source });
    }

    saveDb(filtered);
    res.json({ removed, remaining: filtered.length, source });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete source', details: err.message });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`RAG backend listening on http://localhost:${PORT}`);
});
