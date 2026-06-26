import { describe } from "vitest";

import { defineApiFormatTests } from "../helpers/api";

describe("api cr2 integration", () => {
  defineApiFormatTests("cr2");
});
