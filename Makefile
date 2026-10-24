# Local environment entry points. Needs: colima, docker, docker compose, node 20+.
# PROFILE=s3,pg,loadtest adds optional services:  make up PROFILE=s3
SHELL := /bin/bash
.DEFAULT_GOAL := help
.PHONY: help doctor up down logs ps test test-e2e test-scale clean seed ai-check

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
