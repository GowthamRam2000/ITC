# GST Intelligence Magic - Figma MCP System Architecture

This document gives you a complete architecture diagram spec for:
- Frontend + backend
- Mistral model routing
- ElevenLabs voice layer
- GCP deployment/services
- End-to-end product flows

You can:
1. Render Mermaid directly for docs/reviews.
2. Paste the "Figma MCP prompt" section into your Figma MCP workflow to generate a FigJam/diagram frame.

## 1) Full System Architecture (Mermaid)

```mermaid
flowchart LR
  %% Users
  U1["CA Manager"]
  U2["CA Team Member"]
  U3["SMB Owner"]

  %% Frontend and channels
  subgraph FE["Frontend (React + M3 Expressive)"]
    FE1["Dashboard: Upload + Job Status + Results"]
    FE2["Intelligence Workspace: Portfolio, Readiness, Risk, Evidence"]
    FE3["Floating Copilot: Chat + Voice"]
    FE4["Document Audit Viewer + Invoice Workbench Drawer"]
  end

  %% Identity
  subgraph ID["Identity"]
    ID1["Firebase Auth (Email/Password + Google SSO)"]
  end

  %% Backend API
  subgraph BE["Backend API (FastAPI on Cloud Run)"]
    API1["Job APIs: create, dispatch, status, results, events (SSE)"]
    API2["Reconciliation Pipeline Orchestrator"]
    API3["Scenario Sandbox (What-if Tax Simulator)"]
    API4["AI Auditor (Semantic Spot-checks + Flags)"]
    API5["Reporting APIs: export markdown/pdf, evidence packs, narration text"]
    API6["Voice APIs: transcribe + speak"]
  end

  %% Model routing
  subgraph MODELS["Model Routing Layer"]
    M1["mistral-ocr-latest (OCR)"]
    M2["ministral-3b-latest (fast extract)"]
    M3["ministral-8b-latest (default extract)"]
    M4["ministral-14b-latest (fallback extract)"]
    M5["magistral-medium-latest (reasoning + mismatch ranking)"]
    M6["mistral-large-latest (chat/report/sandbox synthesis)"]
    M7["voxtral-mini-latest (voice STT: EN/HI)"]
  end

  %% Voice providers
  subgraph VOICE["Voice Provider Layer"]
    V1["ElevenLabs TTS (EN/HI/TA narration and copilot voice)"]
    V2["ElevenLabs STT fallback for Tamil/Tanglish"]
  end

  %% Data + storage
  subgraph DATA["State and Artifacts"]
    D1["Firestore (job metadata, progress, context)"]
    D2["GCS Bucket (uploads, OCR artifacts, reports, previews)"]
    D3["Local runtime cache (dev only)"]
  end

  %% GCP platform
  subgraph GCP["GCP Platform Services"]
    G1["Cloud Run: Backend service"]
    G2["Cloud Run: Frontend service (Nginx)"]
    G3["Cloud Tasks (optional async dispatch)"]
    G4["Artifact Registry (container images)"]
    G5["Cloud Build (CI image build/push)"]
    G6["Secret Manager (API keys, tokens)"]
    G7["Cloud Logging + Monitoring"]
  end

  %% Core domain flow
  U1 --> FE
  U2 --> FE
  U3 --> FE

  FE --> ID1
  FE --> API1
  FE --> API3
  FE --> API6
  FE --> API5
  FE --> FE4

  API1 --> API2
  API2 --> M1
  API2 --> M2
  API2 --> M3
  API2 --> M4
  API2 --> M5
  API2 --> M6
  API2 --> API4
  API4 --> M6

  API6 --> M7
  API6 --> V2
  API5 --> V1

  API1 <--> D1
  API2 <--> D1
  API5 <--> D1
  API1 <--> D2
  API2 <--> D2
  API5 <--> D2
  API2 <--> D3

  %% Deployment/runtime mapping
  FE -. deployed .-> G2
  BE -. deployed .-> G1
  API1 -. async dispatch .-> G3
  G1 --> G6
  G2 --> G6
  G1 --> G7
  G2 --> G7
  G5 --> G4
  G4 --> G1
  G4 --> G2
```

## 2) Processing Pipeline (Mermaid)

```mermaid
flowchart TD
  A["Upload Inputs (invoices + GSTR-2B)"] --> B["Ingestion + File Classification"]
  B --> C["OCR or Structured Parse"]
  C --> D["Field Extraction (GSTIN, invoice no, HSN, values, tax heads)"]
  D --> E["Reconciliation Engine (invoice vs GSTR-2B)"]
  E --> F["Rule Engine (ITC, period, rate, GSTIN status, value drift)"]
  F --> G["AI Auditor (semantic checks: HSN vs description, logical inconsistencies)"]
  G --> H["Issue Prioritization (critical/warning/info)"]
  H --> I["Outputs: Results table + Summary KPIs + Evidence Pack + Export"]
  I --> J["Copilot: Chat, Voice Q&A, Scenario Sandbox simulations"]
```

## 3) Figma MCP Prompt (Paste into your Figma MCP workflow)

Use this prompt in your Figma MCP tool to generate a clean architecture frame:

```text
Create a landscape system architecture diagram frame titled "GST Intelligence Magic - End-to-End Architecture".

Style:
- Material 3 expressive, professional fintech look.
- Use compact cards, rounded corners 16-24, subtle glass highlights only on hero and data planes.
- Keep high readability for both light and dark themes.
- Use color groups:
  - Frontend/UI: blue
  - Backend/API: indigo
  - Model routing: purple
  - Voice provider: teal
  - GCP infra: green
  - Data stores: amber

Layout:
1) Top row: Users -> Frontend -> Backend API.
2) Middle row: Model routing lane (Mistral OCR, Ministral 3b/8b/14b, Magistral, Mistral Large, Voxtral).
3) Side lane: ElevenLabs TTS/STT fallback.
4) Lower row: Data layer (Firestore, GCS, runtime cache).
5) Bottom row: GCP infra (Cloud Run FE/BE, Cloud Tasks optional, Artifact Registry, Cloud Build, Secret Manager, Logging/Monitoring).
6) Add directional connectors with labels for key flows:
   - upload
   - reconcile
   - ai auditor
   - scenario sandbox
   - narration
   - report export
   - async dispatch

Mandatory components:
- Frontend modules: Dashboard, Intelligence Workspace, Floating Copilot, Document Audit Viewer.
- Backend modules: Job APIs, Pipeline Orchestrator, Scenario Sandbox, AI Auditor, Reporting, Voice APIs.
- Include "All Jobs vs Selected Job scope" badge near Intelligence Workspace.
- Include language support note: EN, HI, TA, Hinglish, Tanglish.
- Include deployment note: "Cloud Run primary, Cloud Tasks optional".

Output:
- One polished architecture frame.
- One simplified flow frame (upload -> reconcile -> ai auditor -> outputs -> copilot).
- Components should be named exactly as above for handoff consistency.
```

## 4) Coverage Checklist

This diagram covers:
- Frontend pages/components
- Backend services and APIs
- Model stack and model-to-task mapping
- Voice stack (Mistral + ElevenLabs)
- GCP services and deployment lifecycle
- Primary business flows (upload, reconcile, audit, report, chat, voice, scenario simulation)
