# Pipeline configuration

PipeWeaver pipelines are declarative documents that can be stored as JSON or YAML.

## Core sections

- `id`, `name`, `description`
- `source`: connector type, format, and connector config
- `target`: connector type, format, and connector config
- `sourceSchema`, `targetSchema`
- `mapping.fields`: ordered field mappings
- `sampleInput`: optional inline test payload

## Field mapping

Each mapping row supports:

- `from`: source field/path
- `to`: target field/path
- `required`: require source presence
- `transforms`: ordered transform steps

## Example

See `examples/csv_http_to_json.pipeline.json` and `examples/xml_file_to_csv.pipeline.yaml`.
