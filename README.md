# 📚 Chat Notes — RAG Document Chat Assistant

A premium, modern AI chat interface that lets you upload text documents, markdown, or PDFs and ask questions. It uses **Retrieval-Augmented Generation (RAG)** to provide accurate, context-grounded answers with highlighted source citations.

Built with **FastAPI**, **LangChain**, **ChromaDB** (local vector store), **FastEmbed** (local embeddings), and **ChatGroq** (free, high-speed LLM inference via Llama 3).

---

## ✨ Features

- **Responsive Theme**: Premium dark space layout with glassmorphic cards, smooth fades, and sunset-orange glows.
- **Interactive File Upload**: Custom drag-and-drop file upload zone supporting `.pdf`, `.txt`, and `.md` files.
- **Pulsing System Status**: Live indicator showing database connection and environment keys readiness.
- **Context Citations**: Answers dynamically render reference chips that expand to show the exact source document chunks and context used.
- **Robust Markdown Rendering**: Full support for bullet lists, inline code chips, bold syntax, and scrollable pre-formatted code blocks.
- **Dockerized & Deployable**: Pre-configured for zero-configuration deployments on platforms like **Render**.

---

## 🛠️ Technology Stack

- **Frontend**: Vanilla HTML5, CSS3, Javascript, Lucide Icons, and Google Fonts.
- **Backend**: FastAPI (Python 3.12 ASGI framework), Server-Sent Events (SSE) streaming.
- **Orchestration**: LangChain, Recursive Character TextSplitter.
- **Vector Database**: Chroma DB.
- **Embedding Model**: FastEmbed (`BAAI/bge-small-en-v1.5` downloaded locally).
- **Inference Provider**: Groq Cloud API (`llama-3.1-8b-instant`).

---

## 🚀 Local Quickstart

### 1. Prerequisite Setup
Ensure you have Python 3.12+ installed. 

### 2. Configure Environment Variables
Create a file named `.env` in the root directory and add your Groq API Key (get one free at [console.groq.com](https://console.groq.com/)):
```env
GROQ_API_KEY=gsk_your_groq_api_key_goes_here
```

### 3. Install Dependencies
Set up a virtual environment and install the required libraries:
```bash
# Create virtual environment
python -m venv .venv

# Activate virtual environment (Windows)
.venv\Scripts\activate

# Activate virtual environment (Mac/Linux)
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### 4. Run the Application
Start the FastAPI server:
```bash
uvicorn backend:app --reload
```
Open your browser and navigate to: **`http://localhost:8000`**

---

## 🐳 Docker Support

To run the application locally inside a container:

```bash
# Build the Docker image (also downloads and bakes in embedding model weights)
docker build -t chat-notes .

# Run the container
docker run -p 8000:8000 --env-file .env chat-notes
```

---

## ☁️ Deploying to Render

This repository includes a `render.yaml` configuration for automatic infrastructure setup on **Render's Free Tier**:

1. Log in to the [Render Dashboard](https://dashboard.render.com/).
2. Click **New +** and select **Blueprint**.
3. Connect your GitHub repository.
4. Input your `GROQ_API_KEY` under the secrets prompt.
5. Click **Apply** to deploy the service automatically.
