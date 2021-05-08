import { default as c } from "ansi-colors";
import { inspect } from "util";

inspect.styles.string = "yellow";

import { TestRun, Stats } from "../types";

export function printStats(stats: Stats, startTime: number, endTime: number) {
  printColoredTextStats(stats, startTime, endTime);
}

export async function printTestRun(testRun: TestRun, verbose: boolean) {
  await printColoredTextTestRun(testRun, verbose);
}

function printColoredTextStats(
  stats: Stats,
  startTime: number,
  endTime: number,
) {
  let suitesPassed = 0;
  if (stats.suiteStats) {
    for (const suiteStat of stats.suiteStats) {
      if (suiteStat.failed === 0) suitesPassed += 1;
    }
    let testSuitesLine = "Test Suites: ";
    if (stats.suiteStats.length !== suitesPassed)
      testSuitesLine +=
        c.red(`${stats.suiteStats.length - suitesPassed} failed`) + ", ";
    if (suitesPassed !== 0)
      testSuitesLine += c.green(`${suitesPassed} passed`) + ", ";
    testSuitesLine += `${stats.suiteStats.length} total`;
    console.log(testSuitesLine);
  }
  let testsLine = "Tests:       ";
  if (stats.failed !== 0) testsLine += c.red(`${stats.failed} failed`) + ", ";
  if (stats.passed !== 0) testsLine += c.green(`${stats.passed} passed`) + ", ";
  testsLine += `${stats.total} total`;
  console.log(testsLine);
  const secondsString = ((endTime - startTime) / 1000).toFixed(3);
  console.log(`Time:        ${secondsString}s`);
}

async function printColoredTextTestRun(testRun: TestRun, verbose: boolean) {
  let color = testRun.result.failure ? c.red.bold : c.green.bold;
  let symbol = testRun.result.failure ? c.symbols.cross : c.symbols.check;
  let header = `${symbol} `;
  if (testRun.suite) {
    if (testRun.suite.sep)
      header += `SEP-${testRun.suite.sep} ${c.symbols.pointer} `;
    header += `${testRun.suite.name} ${c.symbols.pointer} `;
  }
  header += `${testRun.test.assertion}`;
  console.log(color(header));
  console.group(); // result group
  if (testRun.result.failure) {
    console.log();
    console.log(c.bold("Failure Type:\n"));
    console.group(); // failure type group
    console.log(`${testRun.result.failure.name}\n`);
    console.groupEnd(); // failure type group
    console.log(c.bold("Description:\n"));
    console.group(); // description group
    console.log(testRun.result.failure.message + "\n");
    if (testRun.result.expected && testRun.result.actual) {
      console.log(`Expected: ${testRun.result.expected}`);
      console.log(`Received: '${testRun.result.actual}'\n`);
    }
    console.groupEnd(); // description group
  } else if (verbose) {
    console.log(c.bold("\nDescription:\n"));
    console.group(); // description group
    console.log(testRun.test.successMessage + "\n");
    console.groupEnd(); // description group
  }
  if (verbose && testRun.result.networkCalls.length) {
    console.log(c.bold("Network Calls:\n"));
    for (const networkCall of testRun.result.networkCalls) {
      console.log("Request:\n");
      console.group(); // request group
      console.log(`${networkCall.request.method} ${networkCall.request.url}\n`);
      const requestHeaders = Object.fromEntries(
        networkCall.request.headers.entries(),
      );
      const requestHeaderKeys = Object.keys(requestHeaders);
      if (requestHeaderKeys.length !== 0) {
        console.log("Headers:\n");
        console.group(); // header group
        for (const header of requestHeaderKeys) {
          console.log(`${header}: ${requestHeaders[header]}`);
        }
        console.groupEnd(); // header group
        console.log();
      }
      console.groupEnd(); // request group
      let requestBodyIsJson = false;
      let requestBody: string | object | null = null;
      if (
        requestHeaders["content-type"] &&
        requestHeaders["content-type"].includes("json")
      ) {
        requestBodyIsJson = true;
        requestBody = await networkCall.request.json();
      } else if (
        requestHeaders["content-type"] &&
        requestHeaders["content-type"].includes("multipart/form-data")
      ) {
        requestBody = ""; // TODO
      } else {
        requestBody = await networkCall.request.text();
      }
      if (requestBody) {
        console.log(`Body:\n`);
        if (requestBodyIsJson) {
          console.dir(requestBody, { depth: Infinity, colors: true });
        } else {
          console.group(); // request body group
          console.log(requestBody);
          console.groupEnd();
        }
        console.log();
      }
      console.log("Response:\n");
      console.group(); // response group
      if (networkCall.response) {
        console.log(`Status Code: ${networkCall.response.status}\n`);
        const responseHeaders = Object.fromEntries(
          networkCall.response.headers.entries(),
        );
        const responseHeaderKeys = Object.keys(responseHeaders);
        if (responseHeaderKeys.length !== 0) {
          console.log("Headers:\n");
          console.group(); // header group
          for (const header of responseHeaderKeys) {
            console.log(`${header}: ${responseHeaders[header]}`);
          }
          console.groupEnd(); // header group
          console.log();
        }
        console.log(`Body:\n`);
        const contentType = networkCall.response.headers.get("Content-Type");
        if (contentType && contentType.includes("json")) {
          console.dir(await networkCall.response.json(), {
            depth: Infinity,
            colors: true,
          });
        } else {
          console.group(); // body group
          console.log(await networkCall.response.text());
          console.groupEnd(); // body group
        }
        console.log();
      } else {
        console.log("No response returned.\n");
      }
      console.groupEnd(); // response group
    }
  }
  console.groupEnd(); // result group
}
