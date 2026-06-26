import { describe } from "vitest";

import { defineApiFormatTests } from "../helpers/api";

describe("api svg integration", () => {
  defineApiFormatTests("svg");
});
