# PipeWeaver Documentation

## Architecture overview

PipeWeaver is intentionally organized around extension-friendly seams:

- **connectors** isolate source and sink integration details.
- **formats** convert bytes into canonical records and back again.
- **mapping** owns declarative field movement and transforms.
- **schema** defines validation and schema inference capabilities.
- **runtime** coordinates execution from source to sink.
- **api** exposes the backend for the web UI and automation.
- **store** persists pipeline definitions for local development.

## Canonical record model

The platform uses `map[string]any` for records and dot-path utilities for nested access. This makes decoders and encoders format-agnostic while keeping the configuration explicit and machine-friendly for future AI-assisted mapping suggestions.

## Local development

### Backend

```bash
go test ./...
go run ./cmd/pipeweaver-api
```

### Frontend

```bash
cd web
npm install
npm run dev
npm test -- --run
```

## Pipeline configuration

Pipelines can be expressed in YAML or JSON. They define:

- pipeline metadata,
- source connector configuration,
- target connector configuration,
- source and target formats,
- mapping field rules,
- optional target schema.

### CEL expressions in mappings

PipeWeaver supports optional CEL expressions in field mappings when a target value needs to combine or branch across multiple source fields. Expressions can reference the full record via `record` and top-level identifier-safe fields directly. For example, `record.first_name + " " + record.last_name` or `amount != '' ? amount : '0'`.

See `examples/pipelines` for working samples.

## How to add a new connector

1. Implement `connectors.SourceConnector` or `connectors.SinkConnector`.
2. Register the connector in the connector factory.
3. Add configuration docs and example pipeline definitions.
4. Add integration or unit tests for the connector behavior.

## How to add a new transform

1. Add the transform type handling in `internal/mapping/engine.go`.
2. Extend `mapping.Transform` configuration if new parameters are needed.
3. Add unit tests that cover success and failure cases.
4. Update the frontend transform editor options if the transform should be editable in the UI.

## Frontend structure

The frontend uses:

- `layouts` for application shell layout,
- `views` for route-level pages,
- `components` for editor and preview building blocks,
- `stores` for Pinia state,
- `lib` for API helpers and reusable constants,
- `types` for API-aligned TypeScript models.

## Roadmap

- Visual drag-and-drop mapper.
- Kafka full support.
- Bidirectional SQL connectors.
- Schema registry integration.
- AI-assisted mapping suggestions.
- Versioned pipeline publishing.
- Multi-tenant workspace support.
- Auth and RBAC.
- Protobuf and Avro support.
