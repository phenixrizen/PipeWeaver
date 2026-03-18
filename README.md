# PipeWeaver

PipeWeaver is a self-hosted open-source data transformation platform inspired by Boomi, NiFi, and ETL mapping tools. This first major version focuses on a backend-first architecture with a lightweight Vue-based UI for authoring and testing declarative pipelines.

## Highlights

- Go backend with modular packages for connectors, formats, schema, mapping, runtime, storage, and API.
- Vue 3 + TypeScript + Vite + Tailwind web UI for managing pipelines and testing sample payloads.
- Declarative pipeline definitions in YAML-compatible JSON structures that can be persisted and extended.
- Canonical record model with dot-path helpers for format-agnostic transformations.
- Support for JSON, CSV, TSV, pipe-delimited, and XML formats.
- Sample workflows for CSV HTTP ingestion to JSON and XML file conversion to CSV.

## Repository layout

- `cmd/pipeweaver`: CLI runner for local execution.
- `cmd/pipeweaver-api`: REST API server.
- `internal/api`: HTTP handlers and server setup.
- `internal/connectors`: Source and sink connector interfaces and implementations.
- `internal/formats`: Decoders, encoders, and canonical record utilities.
- `internal/schema`: Internal schema model, validation, and inference.
- `internal/mapping`: Declarative mapping engine and transforms.
- `internal/pipeline`: Pipeline config types and loading helpers.
- `internal/runtime`: End-to-end runtime orchestration.
- `internal/store`: Filesystem-backed pipeline storage.
- `web`: Vue frontend.
- `examples`: Example pipeline definitions and payloads.
- `docs`: Project documentation.

## Quick start

### Backend

```bash
go run ./cmd/pipeweaver-api
```

### CLI runner

```bash
go run ./cmd/pipeweaver --pipeline examples/csv_http_to_json.pipeline.json --input examples/customers.csv
```

### Frontend

```bash
cd web
npm install
npm run dev
```

## Development commands

```bash
make setup
make test
make build
```

## Pipeline model

Pipelines declare:

- source connector and format
- target connector and format
- optional source and target schemas
- field mappings with ordered transforms
- sample data for previewing and tests

See `examples/` and `docs/pipeline-config.md` for details.

## Documentation

- `docs/README.md`
- `docs/architecture.md`
- `docs/pipeline-config.md`
- `docs/extending-connectors.md`
- `docs/extending-transforms.md`
- `docs/frontend.md`
- `docs/roadmap.md`

## License

This repository is intended for open-source development and can be adapted to the license of your choice.
