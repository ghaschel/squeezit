import { describe } from "vitest";

import { defineApiFormatTests } from "../helpers/api";

describe("api heic integration", () => {
  defineApiFormatTests("heic");
});
