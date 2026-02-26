#!/usr/bin/env bun

import { parseArgs } from "node:util";

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    host: { type: "string", default: "127.0.0.1" },
    port: { type: "string", default: "16480" },
  },
});

process.env.HOST = values.host;
process.env.PORT = values.port;

await import("../src/server/index.js");
