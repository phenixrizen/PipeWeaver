SHELL := /bin/bash

.PHONY: setup backend-dev frontend-dev api build test fmt lint clean

setup:
	cd web && npm install
	go mod tidy

backend-dev:
	go run ./cmd/pipeweaver-api

frontend-dev:
	cd web && npm run dev

api:
	go run ./cmd/pipeweaver-api

build:
	go build ./...
	cd web && npm run build

test:
	go test ./...
	cd web && npm run test -- --run

fmt:
	gofmt -w ./cmd ./internal
	cd web && npm run format

lint:
	cd web && npm run typecheck

clean:
	rm -rf web/dist web/node_modules
