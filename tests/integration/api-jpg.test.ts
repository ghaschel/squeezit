import { describe } from "vitest";

import { defineApiFormatTests } from "../helpers/api";

describe("api jpg integration", () => {
  defineApiFormatTests("jpg");
});
