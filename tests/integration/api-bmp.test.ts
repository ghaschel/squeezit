import { describe } from "vitest";

import { defineApiFormatTests } from "../helpers/api";

describe("api bmp integration", () => {
  defineApiFormatTests("bmp");
});
