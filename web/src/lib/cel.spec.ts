import { validateExpression } from "./cel";

it("validates and evaluates a CEL expression against CSV sample payload", () => {
  const result = validateExpression(
    'record.first_name + " " + record.last_name',
    "first_name,last_name\nAda,Lovelace\n",
    "csv",
  );

  expect(result.valid).toBe(true);
  expect(result.message).toContain("Ada Lovelace");
});

it("returns a helpful message for invalid CEL syntax", () => {
  const result = validateExpression(
    "record.first_name + ",
    "first_name\nAda\n",
    "csv",
  );

  expect(result.valid).toBe(false);
});
