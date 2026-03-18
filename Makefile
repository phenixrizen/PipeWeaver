SHELL := /bin/bash

.PHONY: tidy test test-go test-web build build-go build-web dev-api dev-web fmt lint

tidy:
	go mod tidy
	cd web && npm install

fmt:
	gofmt -w $(shell find cmd internal -name '*.go')
	cd web && npm run format

test: test-go test-web

test-go:
	go test ./...

test-web:
	cd web && npm test -- --run

build: build-go build-web

build-go:
	go build ./...

build-web:
	cd web && npm run build

dev-api:
	go run ./cmd/pipeweaver-api

dev-web:
	cd web && npm run dev
