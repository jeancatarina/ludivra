import { Ajv2020 } from "ajv/dist/2020.js";

export function createContractValidator(): Ajv2020 {
  const validator = new Ajv2020({ allErrors: true, strict: false });
  validator.addFormat("date-time", {
    type: "string",
    validate: (value: string) => !Number.isNaN(Date.parse(value))
  });
  return validator;
}
