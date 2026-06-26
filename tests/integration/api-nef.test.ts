import { describe } from "vitest";

import { defineApiFormatTests } from "../helpers/api";

describe("api nef integration", () => {
  defineApiFormatTests("nef");
});
