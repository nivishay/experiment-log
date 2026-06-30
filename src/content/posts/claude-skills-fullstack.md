---
title: "I spent a week learning how to actually build with AI. Here's what clicked."
description: "Watched a series on building full-stack projects from scratch with Claude — and ended up learning less about the tech and more about how to think with an AI agent."
date: 2026-06-30
tags: ["ai", "claude", "workflow", "tdd"]
cover: "/covers/kubernetes.svg"
drivenBy: "Wanted to level up how I work with AI — not just prompt it, but actually build with it."
keyInsight: "The skill isn't writing code with AI. It's knowing how to question it until the project makes sense."
---

## Where it started

Found a YouTube series by AI Hero — a guy who walks through building a full-stack project from zero using Claude. Not a tutorial where everything works. More like watching someone think out loud.

I went through it mostly to pick up new ways of working. Ended up getting more than I expected.

## The skills

### Grilling

Before writing any code, you grill the AI — or let it grill you. You ask hard questions about the project until you actually understand what you're building and why. What's the core user flow? What could go wrong? What are we *not* building?

It sounds obvious. It's not. Most of the time I'd just start building and figure it out later. Grilling forces you to slow down before things get complicated.

### PRD from conversation

After the grilling session, you take the conversation and distill it into a PRD — a short document that captures what the product actually does. Not a spec. More like a shared understanding.

The interesting thing: the process of writing it usually reveals something you missed in the conversation.

### Two Issues

Once you have a PRD, you run it through a skill that breaks it into GitHub issues. Not one big issue. Focused, scoped pieces of work that an agent can actually act on.

### Slices

The issues get broken into vertical slices — thin cuts through the whole stack that deliver something working end to end. The idea is that each slice can be sent to an agent and run in parallel. You're not waiting for one thing to finish before the next starts.

### TDD underneath everything

All of it runs under Test Driven Development. Write the test first, then the code. When you're working with AI agents in parallel, tests are the thing that keeps everything from quietly breaking each other.

## What I took away

The tools are less important than the order. Grilling → PRD → Issues → Slices → Tests. That sequence is the actual skill. The AI fills in the gaps, but you have to build the structure first.

Still experimenting with this. More to come.
