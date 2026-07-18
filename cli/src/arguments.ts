export function optionValue(arguments_: string[], name: string): string | undefined {
  const index = arguments_.indexOf(name);
  return index < 0 ? undefined : arguments_[index + 1];
}

export function commandPositionals(arguments_: string[]): string[] {
  const values: string[] = [];
  for (let index = 1; index < arguments_.length; ++index) {
    const value = arguments_[index];
    if (value === undefined) {
      continue;
    }
    if (value.startsWith("--")) {
      ++index;
    } else {
      values.push(value);
    }
  }
  return values;
}
