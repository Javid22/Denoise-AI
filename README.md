# DenoiseAI

> Restore clarity. Remove noise. Powered by AI.

A complete AI image-denoising web application built around a trained
TensorFlow/Keras CNN (`denoising.h5`). Users can upload a noisy photo and get
an AI-cleaned result, or use the built-in Noise Simulator to add adjustable
artificial noise to a clean image and watch the model recover it.

```
                    ┌───────────────────┐
                    │      User         │
                    └─────────┬─────────┘
                              │
                              ▼
                    ┌───────────────────┐
                    │ React Frontend    │
                    │     Netlify       │
                    └─────────┬─────────┘
                              │
                         HTTP POST
                              │
                              ▼
                    ┌───────────────────┐
                    │ FastAPI Backend   │
                    │     Python        │
                    └─────────┬─────────┘
                              │
                              ▼
                    ┌───────────────────┐
                    │   denoising.h5    │
                    │ TensorFlow/Keras  │
                    └─────────┬─────────┘
                              │
                              ▼
                    ┌───────────────────┐
                    │ Denoised Image    │
                    └───────────────────┘
```

The frontend never runs TensorFlow itself — every prediction is sent to the
Python backend, which loads `denoising.h5` once at startup and runs real
inference on it. No results are faked or simulated.

## Project structure

```
denoise-ai/
├── frontend/            React + Vite app (deploy to Netlify)
│   ├── src/
│   │   ├── components/  Navbar, Hero, ImageUploader, DenoiseSection,
│   │   │                NoiseSimulator, ComparisonSlider, LoadingSpinner,
│   │   │                About, Footer
│   │   ├── api.js       All backend API calls (uses VITE_API_URL)
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   ├── package.json
│   ├── vite.config.js
│   ├── .env.example
│   └── netlify.toml
│
├── backend/             FastAPI service (deploy to Render / Railway / Cloud Run)
│   ├── model/
│   │   └── denoising.h5
│   ├── main.py
│   ├── requirements.txt
│   ├── Procfile
│   ├── .env.example
│   └── README.md
│
└── README.md            (this file)
```

## About the model

`denoising.h5` was inspected before writing any backend code (see
`backend/README.md` for details) and cross-checked against this project's
own training script (`model/denoise.py`). It's a **fully-convolutional
residual U-Net** — input/output shape `(None, None, None, 3)` — trained on
native-resolution crops of real sensor noise. Because resizing an image
before denoising would wash out that noise pattern, the backend **never
resizes uploads**: it runs tiled inference at full native resolution
(reflect-padding each tile to a multiple of 4 for the pooling stages) and
blends overlapping tiles back together, so the result is always exactly
the same size as the original upload.

Preprocessing matches training: pixels are converted to RGB, normalized to
`[0, 1]` (`image / 255.0`), passed through the model, clipped back to
`[0, 1]`, and rescaled to 8-bit RGB.

## Local development

**Backend:**

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
```

Backend runs at `http://localhost:8000` — API docs at
`http://localhost:8000/docs`.

**Frontend:**

```bash
cd frontend
cp .env.example .env   # VITE_API_URL=http://localhost:8000
npm install
npm run dev
```

Frontend runs at `http://localhost:5173`.

Open the frontend URL in your browser — upload an image on the Denoise
section, or try the Noise Simulator, and both flows call the live backend.

## Environment variables

- `frontend/.env` → `VITE_API_URL` — URL of the FastAPI backend. Never
  hardcode the backend URL anywhere in the frontend code; every API call
  goes through `frontend/src/api.js`, which reads this variable.
- `backend/.env` → `FRONTEND_URL` — comma-separated list of allowed CORS
  origins. Use `*` locally; set it to your Netlify URL in production.

## Deployment

### Frontend → Netlify

1. Push this project to GitHub.
2. In Netlify: **Add new site → Import an existing project**, and point it
   at this repository with the base directory set to `frontend`.
3. Build command: `npm run build`
4. Publish directory: `dist`
5. Add an environment variable in Netlify's site settings:
   ```
   VITE_API_URL = https://your-backend-url.example.com
   ```
6. Deploy. `frontend/netlify.toml` already configures the build and a
   catch-all redirect to `index.html` for correct client-side routing.

**Never** deploy `denoising.h5` (or any TensorFlow code) to Netlify — the
frontend is static and only talks to the backend over HTTP.

### Backend → Render / Railway / Google Cloud Run (or any Python host)

1. Point your service at the `backend/` directory.
2. Build command: `pip install -r requirements.txt`
3. Start command:
   ```
   uvicorn main:app --host 0.0.0.0 --port $PORT
   ```
   (`backend/Procfile` already contains this for platforms that read one.)
4. Set the environment variable `FRONTEND_URL` to your deployed Netlify URL,
   e.g. `https://denoiseai.netlify.app`.
5. Once deployed, copy the backend's public URL into Netlify's
   `VITE_API_URL` environment variable (see above) and redeploy the
   frontend so it points at the live backend.

See `backend/README.md` for more detail on the model and preprocessing.

## Notes on quality & honesty

- No accuracy/PSNR/SSIM numbers are claimed anywhere in the UI, since none
  were provided with the model.
- The About section describes what a CNN denoiser does in general terms and
  does not claim "100% noise removal."
- Uploaded images are processed in memory only and are never stored
  permanently by the backend.
