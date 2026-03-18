# Architecture

PipeWeaver is organized as a backend-first monorepo with a Vue frontend.

## Backend layers

1. `internal/formats`: canonical record model and wire-format adapters.
2. `internal/schema`: schema inference, validation, and JSON Schema adapters.
3. `internal/mapping`: declarative field mapping and transforms.
4. `internal/connectors`: source and sink connectors for file, HTTP, and scaffolded Kafka/PostgreSQL.
5. `internal/runtime`: orchestration from source payload to encoded target output.
6. `internal/store`: filesystem persistence for pipeline configs.
7. `internal/api`: REST endpoints for pipeline CRUD, preview, and schema inference.

## Frontend layers

1. `src/views`: route-level pages for pipeline list and editor.
2. `src/components`: reusable editor, mapping, schema, and preview components.
3. `src/stores`: Pinia state management for API-backed pipeline state.
4. `src/lib`: HTTP client helpers and editor utilities.

## Extension points

- New connectors implement `SourceConnector` or `SinkConnector`.
- New formats implement `Decoder` and `Encoder`.
- New transforms are added in `internal/mapping` and exposed through the UI transform editor.
