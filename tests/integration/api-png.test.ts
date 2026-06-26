import { describe } from "vitest";

import { defineApiFormatTests } from "../helpers/api";

describe("api png integration", () => {
  defineApiFormatTests("png");
});
