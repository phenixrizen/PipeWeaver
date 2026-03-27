export interface ConnectorOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

export const connectorTypeOptions: ConnectorOption[] = [
  {
    value: "http",
    label: "http",
    description: "Accept payloads through the generated HTTP endpoint.",
  },
  {
    value: "file",
    label: "file",
    description: "Read from or write transformed payloads to a file.",
  },
  {
    value: "stdout",
    label: "stdout",
    description: "Write the transformed payload to the process output stream.",
  },
];
