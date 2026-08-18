import { SqueezitCommand } from "../base-command";
import { collectCommandCapabilities } from "../capabilities";

const ENVELOPE_SCHEMA_PATH = "schemas/command-envelope-v2.schema.json";
const EVENTS_SCHEMA_PATH = "schemas/command-events-v1.schema.json";
const CAPABILITIES_SCHEMA_PATH = "schemas/capabilities-v1.schema.json";
const OPTIMIZATION_PLAN_SCHEMA_PATH =
  "schemas/optimization-plan-v1.schema.json";
const RUN_RECEIPT_SCHEMA_PATH = "schemas/run-receipt-v1.schema.json";

export default class Capabilities extends SqueezitCommand {
  static override description =
    "Describe Squeezit's machine-readable command and output contract.";

  async run(): Promise<unknown> {
    await this.parse(Capabilities);
    const data = {
      commands: collectCommandCapabilities(
        this.config.commands,
        this.config.pjson.name
      ),
      schemas: {
        capabilities: schemaLocation(
          CAPABILITIES_SCHEMA_PATH,
          this.config.pjson.name,
          this.config.version
        ),
        envelope: schemaLocation(
          ENVELOPE_SCHEMA_PATH,
          this.config.pjson.name,
          this.config.version
        ),
        events: schemaLocation(
          EVENTS_SCHEMA_PATH,
          this.config.pjson.name,
          this.config.version
        ),
        optimizationPlan: schemaLocation(
          OPTIMIZATION_PLAN_SCHEMA_PATH,
          this.config.pjson.name,
          this.config.version
        ),
        runReceipt: schemaLocation(
          RUN_RECEIPT_SCHEMA_PATH,
          this.config.pjson.name,
          this.config.version
        ),
      },
    };

    if (this.jsonEnabled()) return this.emit("capabilities", data);

    this.log("Run sqz capabilities --json for the machine-readable contract.");
    this.log(`Envelope schema: ${ENVELOPE_SCHEMA_PATH}`);
    this.log(`Event schema: ${EVENTS_SCHEMA_PATH}`);
    this.log(`Capabilities schema: ${CAPABILITIES_SCHEMA_PATH}`);
    this.log(`Optimization plan schema: ${OPTIMIZATION_PLAN_SCHEMA_PATH}`);
    this.log(`Run receipt schema: ${RUN_RECEIPT_SCHEMA_PATH}`);
    return data;
  }
}

function schemaLocation(path: string, packageName: string, version: string) {
  return {
    localPath: path,
    url: `https://unpkg.com/${packageName}@${version}/${path}`,
  };
}
