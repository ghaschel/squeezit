import { describe } from "vitest";

import { defineApiFormatTests } from "../helpers/api";

describe("api tiff integration", () => {
  defineApiFormatTests("tiff");
});
