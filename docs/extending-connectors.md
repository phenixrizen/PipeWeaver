# Adding a connector

1. Add a struct in `internal/connectors` implementing either `SourceConnector` or `SinkConnector`.
2. Parse connector-specific config in `Init`.
3. Register the connector in `NewSourceConnector` or `NewSinkConnector`.
4. Add tests covering configuration and runtime behavior.
5. Expose the connector type in the frontend selector metadata if desired.
