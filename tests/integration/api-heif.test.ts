import { describe } from "vitest";

import { defineApiFormatTests } from "../helpers/api";

describe("api heif integration", () => {
  defineApiFormatTests("heif");
});
