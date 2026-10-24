# Local environment entry points. Needs: colima, docker, docker compose, node 20+.
# PROFILE=s3,pg,loadtest adds optional services:  make up PROFILE=s3
SHELL := /bin/bash
.DEFAULT_GOAL := help
.PHONY: help doctor up down logs ps test test-e2e test-scale clean seed ai-check local-ai-up local-ai-down local-ai-dev local-ai-test local-ai-real

help: ## list targets
	@grep -hE '^[a-z0-9-]+:.*##' $(MAKEFILE_LIST) | sed -E 's/:.*## /\t/' | column -t -s $$'\t'

doctor: ## check colima, docker, node, AI endpoint, ports
	@scripts/doctor.sh

up: ## build and start the stack (PROFILE=s3,pg,loadtest optional)
	@scripts/up.sh

down: ## stop containers, keep volumes
	@scripts/down.sh

logs: ## follow web logs
	@. scripts/lib.sh && dc logs -f --tail 100 web

ps: ## show containers
	@. scripts/lib.sh && COMPOSE_PROFILES=s3,pg,loadtest dc ps

test: ## typecheck, unit, contract, security, bdd
	cd web && npm run typecheck && npm run test:unit && npm run test:contract && npm run test:security && npm run test:bdd

test-e2e: ## Playwright against the running stack (make up first)
	cd web && npm run test:e2e

test-scale: ## in-process scale simulation
	cd web && npm run test:scale

clean: ## delete volumes (prints what, needs CONFIRM=yes)
	@scripts/clean.sh

seed: ## create a demo game through the API
	@scripts/seed.sh

ai-check: ## tiny prompt to the AI endpoint, prints latency
	@scripts/ai-check.sh

local-ai-up: ## start the local AI containers (voice, chat, image, video, MCP). LOCAL_AI_MODE=models for real models
	docker compose -f services/local-ai/compose.yml up -d --build

local-ai-down: ## stop the local AI containers
	docker compose -f services/local-ai/compose.yml down

local-ai-dev: ## run the local AI services natively in mock mode (no containers)
	services/local-ai/dev.sh start

local-ai-test: ## end-to-end check of the local AI services through MCP
	services/local-ai/dev.sh status && services/local-ai/.venv/bin/python services/local-ai/tests/smoke.py

local-ai-real: ## run the local AI services natively with REAL models (see services/local-ai/README.md)
	services/local-ai/start-real.sh
