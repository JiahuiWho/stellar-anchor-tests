import { Request } from "node-fetch";
import { validate } from "jsonschema";
import { Keypair } from "stellar-sdk";

import { Test, Result, NetworkCall, Config } from "../../types";
import { makeFailure, genericFailures } from "../../helpers/failure";
import { makeRequest } from "../../helpers/request";
import { infoSchema } from "../../schemas/sep24";
import { tomlExists } from "../sep1/tests";

const tomlTestsGroup = "TOML tests";
const infoTestsGroup = "/info tests";
const depositTestsGroup = "/deposit tests";
const tests: Test[] = [];

const depositEndpoint = "/transactions/deposit/interactive";

const hasTransferServerUrl: Test = {
  assertion: "has a valid transfer server URL",
  sep: 24,
  group: tomlTestsGroup,
  dependencies: [tomlExists],
  failureModes: {
    TRANSFER_SERVER_NOT_FOUND: {
      name: "TRANSFER_SERVER_SEP0024 not found",
      text(_args: any): string {
        return "The stellar.toml file does not have a valid TRANSFER_SERVER_SEP0024 URL";
      },
    },
    NO_HTTPS: {
      name: "no https",
      text(_args: any): string {
        return "The transfer server URL must use HTTPS";
      },
    },
    ENDS_WITH_SLASH: {
      name: "ends with slash",
      text(_args: any): string {
        return "The transfer server URL cannot end with a '/'";
      },
    },
  },
  context: {
    expects: {
      tomlObj: undefined,
    },
    provides: {
      transferServerUrl: undefined,
    },
  },
  async run(_config: Config): Promise<Result> {
    const result: Result = { networkCalls: [] };
    this.context.provides.transferServerUrl =
      this.context.expects.tomlObj.TRANSFER_SERVER_SEP0024 ||
      this.context.expects.tomlObj.TRANSFER_SERVER;
    if (!this.context.provides.transferServerUrl) {
      result.failure = makeFailure(this.failureModes.TRANSFER_SERVER_NOT_FOUND);
      return result;
    }
    if (!this.context.provides.transferServerUrl.startsWith("https")) {
      result.failure = makeFailure(this.failureModes.NO_HTTPS);
      return result;
    }
    if (this.context.provides.transferServerUrl.slice(-1) === "/") {
      result.failure = makeFailure(this.failureModes.ENDS_WITH_SLASH);
      return result;
    }
    return result;
  },
};
tests.push(hasTransferServerUrl);

const isCompliantWithSchema: Test = {
  assertion: "response is compliant with the schema",
  sep: 24,
  group: infoTestsGroup,
  dependencies: [tomlExists, hasTransferServerUrl],
  failureModes: {
    INVALID_SCHEMA: {
      name: "invalid schema",
      text(args: any): string {
        return (
          "The response body returned does not comply with the schema defined for the /info endpoint:\n\n" +
          "https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0024.md#info\n\n" +
          "The errors returned from the schema validation:\n\n" +
          `${args.errors}`
        );
      },
    },
    ...genericFailures,
  },
  context: {
    expects: {
      transferServerUrl: undefined,
    },
    provides: {
      infoObj: undefined,
    },
  },
  async run(_config: Config): Promise<Result> {
    const result: Result = { networkCalls: [] };
    const infoCall: NetworkCall = {
      request: new Request(this.context.expects.transferServerUrl + "/info"),
    };
    result.networkCalls.push(infoCall);
    this.context.provides.infoObj = await makeRequest(
      infoCall,
      200,
      result,
      "application/json",
    );
    if (result.failure) {
      return result;
    }
    const validationResult = validate(
      this.context.provides.infoObj,
      infoSchema,
    );
    if (validationResult.errors.length > 0) {
      result.failure = makeFailure(this.failureModes.INVALID_SCHEMA, {
        errors: validationResult.errors.join("\n"),
      });
    }
    return result;
  },
};
tests.push(isCompliantWithSchema);

const containsConfiguredAssetCode: Test = {
  assertion: "contains configured asset code",
  sep: 24,
  group: infoTestsGroup,
  dependencies: [tomlExists, isCompliantWithSchema],
  failureModes: {
    CONFIGURED_ASSET_CODE_NOT_FOUND: {
      name: "configured asset code not found",
      text(args: any): string {
        return `${args.assetCode} is not present in the /info response`;
      },
    },
    CONFIGURED_ASSET_CODE_NOT_ENABLED: {
      name: "configured asset code not enabled",
      text(args: any): string {
        return `${args.assetCode} is not enabled for SEP-24`;
      },
    },
    NO_ASSET_CODES: {
      name: "no enabled assets",
      text(_args: any): string {
        return "There are no enabled assets in the /info response";
      },
    },
    NO_INFO: {
      name: "unable to parse or fetch /info JSON",
      text(_args: any): string {
        return "unable to fetch JSON";
      },
    },
    ...genericFailures,
  },
  context: {
    expects: {
      infoObj: undefined,
    },
    provides: {},
  },
  async run(config: Config): Promise<Result> {
    const result: Result = { networkCalls: [] };
    const depositAssets = this.context.expects.infoObj.deposit;
    if (!config.assetCode) {
      for (const assetCode in depositAssets) {
        if (depositAssets[assetCode].enabled) {
          config.assetCode = assetCode;
          break;
        }
      }
      if (!config.assetCode) {
        result.failure = makeFailure(this.failureModes.NO_ASSET_CODES);
        return result;
      }
    } else {
      if (!depositAssets[config.assetCode]) {
        result.failure = makeFailure(
          this.failureModes.CONFIGURED_ASSET_CODE_NOT_FOUND,
          { assetCode: config.assetCode },
        );
        return result;
      } else if (!depositAssets[config.assetCode].enabled) {
        result.failure = makeFailure(
          this.failureModes.CONFIGURED_ASSET_CODE_NOT_ENABLED,
          { assetCode: config.assetCode },
        );
        return result;
      }
    }
    return result;
  },
};
tests.push(containsConfiguredAssetCode);

const depositRequiresToken: Test = {
  assertion: "requires a SEP-10 JWT",
  sep: 24,
  group: depositTestsGroup,
  dependencies: [hasTransferServerUrl, containsConfiguredAssetCode],
  context: {
    expects: {
      transferServerUrl: undefined,
    },
    provides: {},
  },
  failureModes: {
    ...genericFailures,
  },
  async run(config: Config): Promise<Result> {
    const result: Result = { networkCalls: [] };
    const postDepositCall: NetworkCall = {
      request: new Request(
        this.context.expects.transferServerUrl + depositEndpoint,
        {
          method: "POST",
          body: JSON.stringify({
            account: Keypair.random().publicKey(),
            asset_code: config.assetCode,
          }),
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    };
    result.networkCalls.push(postDepositCall);
    makeRequest(postDepositCall, 403, result);
    return result;
  },
};
tests.push(depositRequiresToken);

export default tests;
