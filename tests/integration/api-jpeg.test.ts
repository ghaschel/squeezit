import { describe } from "vitest";

import { defineApiFormatTests } from "../helpers/api";

describe("api jpeg integration", () => {
  defineApiFormatTests("jpeg");
});
