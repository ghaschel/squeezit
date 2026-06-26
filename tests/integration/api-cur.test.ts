import { describe } from "vitest";

import { defineApiFormatTests } from "../helpers/api";

describe("api cur integration", () => {
  defineApiFormatTests("cur");
});
