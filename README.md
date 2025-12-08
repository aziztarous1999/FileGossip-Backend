# FileGossip — RAG Chatbot (Angular + Node.js + Groq + AWS LocalStack)

> Production-ready Retrieval‑Augmented Generation chatbot that chats about your files.

![Demo](https://github.com/aziztarous1999/FileGossip-Backend/blob/main/demo/FileGossip%20UI.png)
<p align="center">
  <img alt="Angular" src="https://img.shields.io/badge/Angular-CLI%2013.x-dd0031?logo=angular&logoColor=white">
  <img alt="Node" src="https://img.shields.io/badge/Node.js-18%2B-43853D?logo=node.js&logoColor=white">
  <img alt="Express" src="https://img.shields.io/badge/Express-5.x-black">
  <img alt="Groq" src="https://img.shields.io/badge/Groq-SDK%200.37-blueviolet">
  <img alt="LocalStack" src="https://img.shields.io/badge/AWS-LocalStack-orange?logo=amazonaws&logoColor=white">
  <img alt="License" src="https://img.shields.io/badge/license-CUSTOM-lightgrey">
</p>

## Project setups

```bash
# 1) Backend
cd backend
cp .env.example .env  # add GROQ_API_KEY
npm i
npm run dev           # http://localhost:3000

# 2) Frontend (Angular)
cd ../filegossip
npm i
npm start             # http://localhost:4200

# 3) (Optional) LocalStack for S3‑like storage
localstack start -d
awslocal s3 mb s3://filegossip-dev
```

## Features

- 🔎 **RAG pipeline**: ingest files → chunk → embed → retrieve → generate answers with Groq LLM.
- 📄 **Multi‑file support**: PDFs and text files (extensible).
- ⚡ **On‑device embeddings** via `@xenova/transformers` (no external embedding service).
- 🔒 **CORS‑safe API** with `.env` configuration.
- 🗄️ **Pluggable storage**: local FS by default, optional S3 via LocalStack.
- 🧪 **Dev‑friendly scripts**: `npm run dev` (backend) & `npm start` (frontend).

## Architecture

```
┌─────────────────────┐        REST/JSON        ┌──────────────────────┐
│  Angular App        │  ───────────────────▶   │  Node/Express API    │
│  (filegossip/)      │  ◀───────────────────   │  RAG Orchestrator    │
└─────────┬───────────┘                         └──────────┬───────────┘
          │   Upload/ask                                   │
          ▼                                                ▼
   Local FS / S3 (LocalStack)                    Embeddings: @xenova/transformers
                                                  LLM: Groq (groq-sdk)
                                              Vector store: simple in‑memory / disk
```

## Repository Structure (suggested)

```
.
├── backend/
│   ├── index.js
│   ├── package.json
│   ├── .env.example
│   └── vector-store.json    # chunking, embeddings, store, retrieval
└── filegossip/              # Angular app (CLI 13.x per package.json)
    ├── src/
    └── package.json
```

---

## Backend

**Tech:** Node.js (ES modules), Express 5, `groq-sdk`, `@xenova/transformers`, `dotenv`, `cors`.

### Install & Run

```bash
cd backend
npm i
npm run dev             # or: npm start
```

### Environment

Create `.env` in `backend/`:

```env
GROQ_API_KEY=your_groq_api_key
PORT=3000
```

> **Why these envs?** Keep provider keys out of source.

### API (reference)

> Endpoints below are suggested defaults. Adjust to your actual handlers.

- `POST /api/docs` → body: `{ filename, content|file }` → stores, chunks, embeds.
- `POST /api/chat` → body: `{ question, topK=5 }` → RAG answer with sources.
- `DELETE /api/docs` → clears a document vector store/index.

**Sample request**

```bash
curl -X POST http://localhost:3000/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"query":"What does the contract say about termination?","topK":5}'
```

### Scripts

From `backend/package.json`:

```json
{
  "start": "node index.js",
  "dev": "nodemon index.js"
}
```

---

## Frontend (Angular)

**Tech:** Angular CLI **13.x** (per package.json), Angular Material, RxJS, pdfjs-dist, Toastr.

### Install & Run

```bash
cd filegossip
npm i
npm start      # serves at http://localhost:4200
```

### Environment (Angular)

Create `src/environments/environment.ts`:

```ts
export const environment = {
  production: false,
  apiUrl: 'http://localhost:4000'
};
```

For prod: `environment.prod.ts` with deployed API URL.

### Typical UI Flow

1. Upload files (PDF/TXT) → show ingest status.
2. Ask questions → stream answer + source snippets.
3. Manage dataset → clear/reset (dev only).

---

## AWS LocalStack (optional but recommended)

Use LocalStack to emulate S3 without touching real AWS.

```bash
# Start
localstack start -d

# Create bucket
awslocal s3 mb s3://filegossip-dev

# Verify
awslocal s3 ls
```

**Backend config**: set `STORAGE=s3` and S3 vars in `.env`.

---

## RAG Pipeline (implementation notes)

- **Chunking**: fixed/semantic chunker (e.g., 512–1k tokens, 50–100 overlap).
- **Embeddings**: `@xenova/transformers` model `Xenova/all-MiniLM-L6-v2` (384‑dim). Runs CPU, no Python.
- **Vector store**: start with in‑memory + JSON on disk; consider SQLite/pgvector later.
- **Retrieval**: cosine similarity, `topK` adjustable.
- **Generation**: Groq SDK → pass retrieved context + user query; include citations.

---

## Upgrade guide: Angular 13 → 16+/21 (overview)

- Update Node to **18+**.
- Bump Angular packages with `ng update @angular/core@^16 @angular/cli@^16` (stepwise).
- Migrate to standalone APIs (optional), remove `rxjs-compat`, update RxJS to 7.x.
- Replace deprecated libraries (e.g., `protractor` → Cypress).
- Re‑test build `ng build` and adjust polyfills.

---

## Development Checklist

- [ ] `.env` created with valid `GROQ_API_KEY`.
- [ ] API reachable from Angular (CORS OK).
- [ ] Ingest at least one file and verify embeddings saved.
- [ ] Chat returns citations/snippets.
- [ ] (If S3) Bucket exists in LocalStack and creds are set.

---

## Troubleshooting

- **CORS errors**: ensure `CORS_ORIGIN` matches the Angular URL.
- **Missing model**: first run downloads `@xenova/transformers` weights; allow time/disk.
- **Empty answers**: verify ingest finished and `topK` > 0.
- **LocalStack 403**: use `awslocal` and test with `AWS_ACCESS_KEY_ID=test`/`AWS_SECRET_ACCESS_KEY=test`.
- **Angular build errors**: clear cache `rm -rf node_modules package-lock.json && npm i`.

---

## Scripts quick reference

**Backend**

```bash
npm run dev      # hot reload via nodemon
npm start        # production start
```

**Frontend**

```bash
npm start        # ng serve
npm run build    # CI=false ng build
```

---

## Security

- Do **not** commit `.env` or secrets.
- Consider rate limiting & request size limits on `/api/ingest`.
- Validate file types and sanitize PDF text extraction.

---

## Roadmap

- [ ] Streaming responses (Server‑Sent Events).
- [ ] pgvector/SQLite vector store.
- [ ] Auth (JWT) & per‑user datasets.
- [ ] UI: source preview & file manager.

---

## License

This repository is an open‑source project designed to be adapted for your specific requirements.

---

## Acknowledgements

- Groq LLMs via [`groq-sdk`].
- Embeddings by [`@xenova/transformers`].
- PDF parsing via `pdfjs-dist` (frontend).

---


## 🔗 Links

[![portfolio](https://img.shields.io/badge/my_portfolio-000?style=for-the-badge&logo=ko-fi&logoColor=white)](aziz-tarous.vercel.app) &nbsp;   &nbsp;   &nbsp;   &nbsp;   &nbsp;   [![linkedin](https://img.shields.io/badge/linkedin-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/aziz-tarous/)
