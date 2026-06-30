---
title: "Can you deploy an ML model that scales automatically under load?"
description: "I wanted to understand how Kubernetes actually works, so instead of just reading documentation, I built a full ML inference service to see it in action."
date: 2026-06-01
tags: ["kubernetes", "docker", "ml", "python"]
github: "https://github.com/nivishay/learning-and-experiments/tree/main/ml-interface-using-k8"
drivenBy: "I wanted to understand how Kubernetes actually works, so instead of just reading documentation, I built a full-scale ML inference service to see it in action."
keyInsight: "Kubernetes was silently killing my pod in an infinite restart loop — because DistilBERT takes 40 seconds to load and the liveness probe didn't know that."
---

## The Tech Stack

- **Kubernetes (Minikube)** — the orchestrator managing the service
- **FastAPI** — a lightweight, high-performance web framework for the API
- **DistilBERT** — a compact, fast version of BERT, perfect for sentiment analysis without excessive resource overhead
- **HPA (Horizontal Pod Autoscaler)** — automatically scales the number of running pods based on CPU load

## 1. Liveness vs. Readiness Probes

DistilBERT takes about 40 seconds to load into memory. Kubernetes' default liveness check was too fast — it would kill the pod because it didn't respond in 10 seconds, causing an infinite restart loop.

The fix: I learned to use readiness probes to tell Kubernetes, "The pod is alive, but don't send traffic until the model is fully loaded." Configuring `initialDelaySeconds` finally stopped the restart loops.

```yaml
livenessProbe:
  httpGet:
    path: /healthz
    port: 8000
  initialDelaySeconds: 60
  periodSeconds: 15
readinessProbe:
  httpGet:
    path: /healthz
    port: 8000
  initialDelaySeconds: 30
  periodSeconds: 10
```

## 2. Pre-caching the Model

At first, my container tried to download the model from HuggingFace every time it started. This meant that whenever the system tried to scale up, new pods would just sit there waiting for a network download.

The fix: I used a multi-stage Dockerfile to "bake" the model directly into the image. The image is larger (~1.5 GB), but the pods start up ready to serve requests instantly, without needing a stable internet connection at runtime.

```dockerfile
# Stage 1: install dependencies
FROM python:3.11-slim AS builder
RUN pip install --prefix=/install -r requirements.txt

# Stage 2: download and cache the model
FROM python:3.11-slim AS model-downloader
COPY --from=builder /install /usr/local
ENV HF_HOME=/model-cache
RUN python -c "from transformers import pipeline; pipeline('sentiment-analysis', model='distilbert/distilbert-base-uncased-finetuned-sst-2-english')"

# Stage 3: runtime — model is already baked in
FROM python:3.11-slim
COPY --from=builder /install /usr/local
COPY --from=model-downloader /model-cache /model-cache
ENV HF_HOME=/model-cache
COPY main.py .
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

## 3. Understanding HPA and Resources

I mistakenly thought the autoscaler (HPA) looked at my "limit" — the max CPU a pod can use. It turns out it only cares about the "request" — the CPU I reserved.

The lesson: I set my requests carefully to create a "Burstable" setup. This ensures that when CPU usage spikes, the autoscaler actually triggers as intended instead of being throttled by the hard limits.

```yaml
resources:
  requests:
    cpu: "250m"    # HPA watches this — 60% of 250m = triggers at 150m
    memory: "512Mi"
  limits:
    cpu: "1000m"   # hard ceiling, does not affect HPA math
    memory: "1Gi"
```

## Live: HPA scaling in action

Below is a split-screen of `kubectl get pods --watch` (left) and `kubectl get hpa --watch` (right) — you can see the pods cycling through `ContainerCreating → Running → Terminating` as the HPA reacts to CPU load, scaling from 2 up to 6 replicas and back down.

![kubectl output showing HPA scaling pods in real time](/screenshots/ml-k8s-github.png)
