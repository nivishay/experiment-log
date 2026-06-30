---
title: "Deploy ML model that scales automatically under load."
description: "Came across a job at NVIDIA working on ML performance in the cloud — using Kubernetes. Never actually used it, so I built a small experiment to find out what happens when you try."
date: 2026-06-01
tags: ["kubernetes", "docker", "ml", "python"]
github: "https://github.com/nivishay/learning-and-experiments/tree/main/ml-interface-using-k8"
drivenBy: "Came across a job at NVIDIA working on ML performance in the cloud — using Kubernetes. Never actually used it, so I built a small experiment to find out what happens when you try."
keyInsight: "Kubernetes was silently killing my pod in an infinite restart loop — because DistilBERT takes 40 seconds to load and the liveness probe didn't know that."
---

## The Stack

- **Kubernetes (Minikube)** — the orchestrator managing the service
- **FastAPI** — lightweight Python web framework for the API
- **DistilBERT** — a compact BERT model for sentiment analysis
- **HPA (Horizontal Pod Autoscaler)** — automatically scales pods based on CPU load

## Getting started

I started with a YouTube video and a podcast that broke down the basics — what pods are, how the scheduler works, what it actually means to "orchestrate" containers. It clicked in theory. So I set up Minikube, wrapped DistilBERT in a FastAPI service, and tried to get it running inside a cluster.

## Problem 1 — The pod kept dying

The first thing I noticed: my pod would start, and then Kubernetes would kill it. Over and over. I had no idea why.

Turned out DistilBERT takes about 40 seconds to load into memory. Kubernetes' liveness probe was pinging after 10 seconds, getting no response, and deciding the pod was dead — infinite restart loop.

The fix was separating the *liveness* probe (is the process alive?) from the *readiness* probe (is it ready to serve traffic?). Setting `initialDelaySeconds` to give the model time to load fixed it immediately.

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

## Problem 2 — Scaling was slow

Once I added HPA to scale under load, new pods were taking forever to become ready. The model was downloading from HuggingFace on every single startup.

The fix was baking the model directly into the Docker image using a multi-stage build. The image got bigger (~1.5 GB), but pods went from "waiting on a network download" to "ready to serve" almost instantly.

```dockerfile
# Stage 1: install dependencies
FROM python:3.11-slim AS builder
RUN pip install --prefix=/install -r requirements.txt

# Stage 2: download and cache the model at build time
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

## Problem 3 — HPA wasn't triggering

I thought the autoscaler watched CPU *limits* (the ceiling). It doesn't — it watches CPU *requests* (what you reserved). My limits were set too high, so the math never triggered a scale-up event.

Once I set requests to a realistic number, HPA started firing exactly as expected.

```yaml
resources:
  requests:
    cpu: "250m"    # HPA watches this — 60% of 250m triggers at 150m
    memory: "512Mi"
  limits:
    cpu: "1000m"   # hard ceiling, does not affect HPA math
    memory: "1Gi"
```

## Seeing it work

Here's a split-screen of `kubectl get pods --watch` and `kubectl get hpa --watch` — pods cycling through `ContainerCreating → Running → Terminating` as HPA reacts to CPU load, scaling from 2 up to 6 replicas and back down.

![kubectl output showing HPA scaling pods in real time](/screenshots/ml-k8s-github.png)
