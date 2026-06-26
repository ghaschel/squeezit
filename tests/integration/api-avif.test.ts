import { describe } from "vitest";

import { defineApiFormatTests } from "../helpers/api";

describe("api avif integration", () => {
  defineApiFormatTests("avif");
});
