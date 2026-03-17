# Avatar Video Processor Worker

This is a server-side worker designed to run on Hugging Face Spaces (Docker SDK). It handles video Speech-to-Text (STT) and slicing to bypass browser memory and permission limitations.

## Deployment to Hugging Face

1. Create a new Space on Hugging Face.
2. Select **Docker** as the SDK.
3. Choose **Blank** or **FastAPI** template (since we provide the Dockerfile, any works).
4. Upload the files from this folder (`app.py`, `requirements.txt`, `Dockerfile`) to the Space.
5. Hugging Face will automatically build and start the container.
6. Once it's "Running", copy your Space URL (e.g., `https://your-username-space-name.hf.space`).

## Environment Variables

You don't need any secrets on Hugging Face because they are passed in the request body from your main application (securely).

## API Endpoint

`POST /process`

**Payload:**
```json
{
    "videoUrl": "...",
    "projectId": "...",
    "supabaseUrl": "...",
    "supabaseKey": "...",
    "openaiKey": "..."
}
```
