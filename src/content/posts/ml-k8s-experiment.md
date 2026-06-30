---
title: "Can you deploy an ML model that scales automatically under load?"
description: "I had zero Kubernetes experience. I had an NVIDIA interview coming up. I built a real ML inference service to find out."
date: 2026-06-01
tags: ["kubernetes", "docker", "ml", "python"]
github: "https://github.com/nivishay/ml-interface-k8s"
drivenBy: "I had a technical interview at NVIDIA coming up. They run ML infrastructure on Kubernetes at scale — GPU clusters, distributed training, inference serving. I had zero K8s experience. I decided the only way to actually understand it was to build something real, not just read docs."
keyInsight: "Kubernetes was silently killing my pod in an infinite restart loop — because DistilBERT takes 40 seconds to load and the liveness probe didn't know that."
---

## What I expected

Kubernetes sounded like "Docker, but with autoscaling." I figured I'd wrap my model in a container, write some YAML, and it would scale up cleanly when traffic hit. Straightforward.

It wasn't.

## What I actually found

Three things surprised me — and each one revealed something real about how Kubernetes works.

### 1. Kubernetes will kill your ML pod before it's ready

DistilBERT takes ~40 seconds to load into memory. Kubernetes' liveness probe was hitting `/healthz` at second 10, getting no response, and restarting the pod. Infinite restart loop.

The fix was `initialDelaySeconds: 60` — but understanding *why* meant learning the difference between two probe types:

- **Liveness probe** — is the pod still alive? Kill and restart it if not.
- **Readiness probe** — is the pod ready to receive traffic? Stop routing to it if not.

They're separate for a reason. A pod can be alive but not ready. For an ML service, that window (model loading) can be 30–60 seconds. If you don't configure `initialDelaySeconds` correctly, Kubernetes destroys the pod before it's ever usable.

```yaml
livenessProbe:
  httpGet:
    path: /healthz
    port: 8000
  initialDelaySeconds: 60   # give DistilBERT time to load
  periodSeconds: 15
readinessProbe:
  httpGet:
    path: /healthz
    port: 8000
  initialDelaySeconds: 30
  periodSeconds: 10
```

### 2. Baking the model into the image matters

My first Dockerfile downloaded DistilBERT from HuggingFace at container startup. Every new pod took 60+ seconds to become ready — network call included. Under load, when the HPA tries to scale up, every new pod is waiting on a download before it can serve requests.

The fix: a 3-stage Dockerfile.

```dockerfile
# Stage 1: install dependencies
FROM python:3.11-slim AS builder
COPY requirements.txt .
RUN pip install --prefix=/install -r requirements.txt

# Stage 2: download model (cached independently from code changes)
FROM python:3.11-slim AS model-downloader
COPY --from=builder /install /usr/local
ENV HF_HOME=/model-cache
RUN python -c "from transformers import pipeline; pipeline('sentiment-analysis', model='distilbert/distilbert-base-uncased-finetuned-sst-2-english')"

# Stage 3: runtime — bake everything in
FROM python:3.11-slim
COPY --from=builder /install /usr/local
COPY --from=model-downloader /model-cache /model-cache
ENV HF_HOME=/model-cache
COPY main.py .
RUN useradd --create-home appuser && chown -R appuser:appuser /app /model-cache
USER appuser
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

The model is baked in. Pods start in ~40s (just load time, no network). The image is larger (~1.5 GB), but for an inference service the startup speed tradeoff is worth it.

### 3. CPU requests and limits are not the same thing — and it matters for HPA

I set `requests: 250m` and `limits: 1000m`. I thought I was being clever by giving the pod room to burst. But I didn't fully understand what each field does.

- **`requests`** — what the scheduler *guarantees*. Kubernetes uses this to decide which node can fit the pod.
- **`limits`** — the hard ceiling. The container gets throttled or OOM-killed if it exceeds this.
- Setting them differently = **Burstable QoS class** — the pod can use up to 1 CPU but may get throttled under node pressure.

More importantly: **HPA uses the `requests` value for its math**, not the actual usage ceiling. With `requests: 250m` and a 60% CPU target, HPA scales at 150m of actual CPU usage. That's very conservative. A single inference request might spike to 300–400m briefly, but by the time HPA notices (30-second scrape interval + stabilization window), the spike has passed.

```yaml
metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 60   # 60% of requests (250m) = 150m trigger
```

## What I built

A FastAPI sentiment-analysis service running DistilBERT, deployed on Minikube with:

- **Deployment** — 2 replicas, liveness + readiness probes, Burstable QoS (requests: 250m/512Mi, limits: 1000m/1Gi)
- **LoadBalancer Service** — port 80 → container port 8000
- **HPA** — 2–6 replicas, scales at 60% average CPU utilization
- **3-stage Dockerfile** — bakes the model in, runs as non-root user (`appuser`)

The inference endpoint is simple: POST `/predict` with `{"text": "..."}`, get back a sentiment label and confidence score.

## What I'd do next

Load test with `k6` or `locust` and actually watch the HPA fire past 2 replicas. I configured it but never pushed it hard enough to trigger scaling. I'd also want to measure the actual cold-start latency distribution — my 40s estimate is a rough average, not a p95.
