# PipeWeaver

PipeWeaver is a self-hosted open-source configurable data transformation platform inspired by Boomi, NiFi, and classic ETL mappers. The first major version in this repository focuses on a strong backend MVP with a clean Vue-based web UI that can grow into a visual mapping product.

## Vision

PipeWeaver helps teams define pipelines that:

- ingest records from HTTP, files, and future streaming/database connectors,
- decode formats such as JSON, CSV, TSV, pipe-delimited text, and XML,
- map incoming data into a canonical record model,
- apply reusable transforms,
- validate output against schemas, and
- emit transformed data to files, stdout, and future sinks.

## MVP capabilities

- Go backend with modular packages for connectors, formats, schema, mapping, runtime, store, and API.
- Vue 3 + TypeScript + Vite + Tailwind frontend with a polished pipeline editor.
- Declarative pipeline definitions in YAML and JSON.
- Canonical record path helpers using dot notation.
- Mapping engine with trim, case conversion, type conversion, default values, concat, CEL expressions for multi-field reads, and conditional/date scaffolds.
- Schema inference and JSON Schema aware validation.
- Example pipelines for CSV → JSON, XML → CSV, JSON → TSV, TSV → JSON, and pipe-delimited → XML.
- CLI runner for local execution and API server for UI-driven workflow testing.

## Repository layout

```text
/cmd/pipeweaver
/cmd/pipeweaver-api
/internal/api
/internal/pipeline
/internal/connectors
/internal/formats
/internal/schema
/internal/mapping
/internal/runtime
/internal/store
/web
/examples
/docs
```

## Quick start

### Backend

```bash
go mod tidy
go test ./...
go run ./cmd/pipeweaver-api
go run ./cmd/pipeweaver-api -seed-examples
```

Run the API with `-seed-examples` to copy the bundled files from `examples/pipelines` into the active store root so they appear in the UI. Use `-seed-source` to point at a different directory, and `PIPEWEAVER_STORE_ROOT` if you want to seed a non-default store location.

### Frontend

```bash
cd web
npm install
npm run dev
```

The API server defaults to `http://localhost:8080` and the Vite dev server defaults to `http://localhost:5173`.

### Full build

```bash
make build
```

## Example pipelines

- `examples/pipelines/csv_http_to_json.yaml`
- `examples/pipelines/xml_file_to_csv.json`
- `examples/pipelines/csv_http_to_json_cel.yaml`
- `examples/pipelines/json_file_to_tsv.yaml`
- `examples/pipelines/tsv_file_to_json.yaml`
- `examples/pipelines/pipe_http_to_xml.yaml`

## Documentation

- `docs/README.md` — architecture, roadmap, extension points, and contributor guide.

## Next steps after MVP

- richer visual drag-and-drop mapping,
- production-grade Kafka and PostgreSQL connectors,
- pipeline versioning and publishing,
- schema registry support,
- AI-assisted field mapping suggestions.
