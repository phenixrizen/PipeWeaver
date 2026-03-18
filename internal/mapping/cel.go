package mapping

import (
	"fmt"
	"regexp"

	"github.com/google/cel-go/cel"
	"github.com/phenixrizen/PipeWeaver/internal/formats"
)

var celIdentifierPattern = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*$`)

// EvaluateExpression runs a CEL expression against a canonical record so mappings can read from multiple fields.
func EvaluateExpression(record formats.Record, expression string) (any, error) {
	declarations := []cel.EnvOption{
		cel.Variable("record", cel.DynType),
	}
	activation := map[string]any{
		"record": map[string]any(record),
	}

	// Top-level identifier-safe keys are also exposed directly to make simple expressions less verbose.
	for key, value := range record {
		if !celIdentifierPattern.MatchString(key) {
			continue
		}
		declarations = append(declarations, cel.Variable(key, cel.DynType))
		activation[key] = value
	}

	env, err := cel.NewEnv(declarations...)
	if err != nil {
		return nil, fmt.Errorf("create cel environment: %w", err)
	}
	ast, issues := env.Compile(expression)
	if issues != nil && issues.Err() != nil {
		return nil, fmt.Errorf("compile cel expression: %w", issues.Err())
	}
	program, err := env.Program(ast)
	if err != nil {
		return nil, fmt.Errorf("create cel program: %w", err)
	}
	out, _, err := program.Eval(activation)
	if err != nil {
		return nil, fmt.Errorf("evaluate cel expression: %w", err)
	}
	return out.Value(), nil
}
