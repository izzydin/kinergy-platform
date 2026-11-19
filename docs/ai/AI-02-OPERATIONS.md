# Kynergy Intelligence Local AI Operations Guide (AI-02)

- **Document Identifier:** `AI-02-OPERATIONS`
- **Date:** 2026-11-19
- **Repository:** `izzydin/kinergy-platform`
- **Role:** Senior ML Infrastructure Engineer, Site Reliability Engineer
- **Milestone:** AI-02 — Local AI Infrastructure & Provider Integration
- **Status:** OPERATIONAL RUNBOOK

---

## 1. Quick Reference & Core Operations

This operational guide provides executable commands and troubleshooting workflows for managing the local inference runtime supporting **Kynergy Intelligence** on Windows development hosts and Docker environments.

### 1.1 Starting the Ollama Daemon

Ollama runs natively on the Windows host as a detached background daemon:

```powershell
# Set loopback binding and single-stream execution
$env:OLLAMA_HOST = "127.0.0.1:11434"
$env:OLLAMA_NUM_PARALLEL = "1"

# Launch daemon in background with file logging
Start-Process -FilePath "C:\Users\MI EQUIPO\AppData\Local\Programs\Ollama\ollama.exe" `
  -ArgumentList "serve" `
  -WindowStyle Hidden `
  -RedirectStandardOutput "C:\Users\MI EQUIPO\.ollama\ollama_stdout.log" `
  -RedirectStandardError "C:\Users\MI EQUIPO\.ollama\ollama_stderr.log"
```

### 1.2 Stopping the Ollama Daemon

```powershell
Get-Process | Where-Object { $_.ProcessName -like "*ollama*" } | Stop-Process -Force
```

### 1.3 Verifying Model Inventory & Versions

```powershell
$env:OLLAMA_HOST = "127.0.0.1:11434"
& "C:\Users\MI EQUIPO\AppData\Local\Programs\Ollama\ollama.exe" list
```

_Expected Output:_

- `qwen3:4b` (`359d7dd4bcda`, 2.5 GB, `Q4_K_M`)
- `bge-m3:latest` (`790764642607`, 1.2 GB, `F16`, 1,024 dims)

---

## 2. Checking Provider Readiness & Health

### 2.1 Host Health Inspection

Query the local loopback endpoint directly:

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/tags" | Select-Object -ExpandProperty models
```

### 2.2 Container Health Inspection (Docker-to-Host)

Query from inside the running API container:

```bash
docker exec kinergy-demo-api node -e "const http = require('http'); http.get('http://host.docker.internal:11434/api/tags', (res) => { let d = ''; res.on('data', c => d += c); res.on('end', () => console.log(JSON.parse(d).models.map(m => m.name))); });"
```

### 2.3 NestJS Decoupled Health Endpoint

Query the dedicated, non-blocking AI subsystem health endpoint:

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/v1/ai/health"
```

_Expected Response (When Operational):_

```json
{
  "enabled": true,
  "overallStatus": "OPERATIONAL",
  "provider": "ollama",
  "runtimeReachable": true,
  "models": {
    "chat": {
      "name": "qwen3:4b",
      "isInstalled": true,
      "isLoaded": true,
      "isCapable": true,
      "latencyMs": 24
    },
    "embedding": {
      "name": "bge-m3:latest",
      "dimensions": 1024,
      "isInstalled": true,
      "isLoaded": false,
      "isCapable": true,
      "latencyMs": 24
    }
  }
}
```

---

## 3. Manual Inference & Vector Testing

### 3.1 Testing Text Generation (Host)

```powershell
$body = @{
  model = "qwen3:4b"
  prompt = "State in one sentence what Kinergy Platform does."
  stream = $false
  options = @{ temperature = 0.2; num_predict = 60 }
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/generate" -Method Post -ContentType "application/json" -Body $body | Select-Object response
```

### 3.2 Testing Dense Embeddings (Host)

```powershell
$body = @{
  model = "bge-m3:latest"
  prompt = "Clinical evaluation of anterior cruciate ligament range of motion."
} | ConvertTo-Json

$res = Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/embeddings" -Method Post -ContentType "application/json" -Body $body
Write-Host "Vector dimensions:" $res.embedding.Length
```

---

## 4. Resource Monitoring & GPU Telemetry

### 4.1 Monitoring GPU Utilization & VRAM

Run `nvidia-smi` to inspect active compute processes and memory consumption:

```powershell
nvidia-smi --query-gpu=utilization.gpu,memory.used,memory.free,temperature.gpu,power.draw --format=csv -l 2
```

_Key Thresholds:_

- **Total VRAM:** 8,192 MiB.
- **Normal Operating Range:** $4,500 - 5,500\text{ MiB}$ with both models loaded.
- **Safety Ceiling:** Do not allow background apps to push total VRAM beyond $7,500\text{ MiB}$.

### 4.2 Inspecting Resident Models in Memory

Query Ollama's active process table (`/api/ps`) to inspect models currently held in GPU VRAM without triggering inferencing:

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/ps"
```

---

## 5. Troubleshooting & Failure Recovery

### 5.1 Scenario: Circuit Breaker Tripped (`LLM_PROVIDER_UNAVAILABLE`)

- **Symptoms:** API calls immediately fail within $< 2\text{ ms}$ with message `"Circuit breaker is open: LLM service is currently marked offline."`
- **Cause:** 3 consecutive requests failed (e.g., Ollama crashed, timed out, or socket disconnected).
- **Remedy:**
  1. Verify if Ollama is running: `Get-Process | Where-Object { $_.ProcessName -like "*ollama*" }`.
  2. If stopped, restart Ollama (Section 1.1).
  3. Wait 15 seconds for the circuit breaker cooldown period to expire.
  4. The next incoming request will transition the circuit breaker to half-open and automatically recover on success.

### 5.2 Scenario: `host.docker.internal` Connection Refused

- **Symptoms:** Container logs show `ECONNREFUSED` or `ETIMEDOUT` when calling `http://host.docker.internal:11434`.
- **Cause:** Ollama was started bound strictly to a non-loopback address, or Windows Defender Firewall blocked Docker Desktop proxying.
- **Remedy:**
  1. Confirm Ollama is listening on `127.0.0.1:11434`:
     ```powershell
     Get-NetTCPConnection -LocalPort 11434 | Select-Object LocalAddress, State
     ```
  2. Restart Ollama with explicit `$env:OLLAMA_HOST = "127.0.0.1:11434"`. Docker Desktop automatically proxies `host.docker.internal` into loopback.

### 5.3 Scenario: GPU Out of Memory (OOM) or Layer Eviction

- **Symptoms:** Generation latency spikes from $< 1\text{s}$ to $> 10\text{s}$, or stderr log reports `falling back to CPU compute`.
- **Cause:** Heavy background graphics applications (Chrome 4K video, Discord hardware acceleration, 3D gaming) claimed host VRAM.
- **Remedy:**
  1. Close non-essential GPU background applications.
  2. Restart Ollama to flush VRAM: `Get-Process *ollama* | Stop-Process -Force`.
  3. Ensure `AI_CHAT_CONTEXT_WINDOW=4096` in `.env` to prevent KV-cache explosion.

---

## 6. Model Management & Updates

### 6.1 Updating Model Weights

```powershell
$env:OLLAMA_HOST = "127.0.0.1:11434"
& "C:\Users\MI EQUIPO\AppData\Local\Programs\Ollama\ollama.exe" pull qwen3:4b
& "C:\Users\MI EQUIPO\AppData\Local\Programs\Ollama\ollama.exe" pull bge-m3:latest
```

### 6.2 Purging Corrupted Weights & Re-downloading

```powershell
& "C:\Users\MI EQUIPO\AppData\Local\Programs\Ollama\ollama.exe" rm qwen3:4b
& "C:\Users\MI EQUIPO\AppData\Local\Programs\Ollama\ollama.exe" pull qwen3:4b
```

---

## 7. Disabling AI Subsystem (Emergency / Production MVP)

To completely decouple the application from the AI runtime without modifying application code:

1. In `.env`:
   ```bash
   AI_ENABLED=false
   AI_LLM_PROVIDER=mock
   AI_EMBEDDING_PROVIDER=mock
   ```
2. Stop the local Ollama daemon:
   ```powershell
   Get-Process | Where-Object { $_.ProcessName -like "*ollama*" } | Stop-Process -Force
   ```
3. Restart NestJS API. The application will start immediately, mock adapters will service tests, general health checks will report `status: 'ok'`, and `/api/v1/ai/health` will report `{ enabled: false, overallStatus: 'DISABLED' }`.
