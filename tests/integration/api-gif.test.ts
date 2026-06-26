import { describe } from "vitest";

import { defineApiFormatTests } from "../helpers/api";

describe("api gif integration", () => {
  defineApiFormatTests("gif");
});
