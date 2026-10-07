import { discoverAdobeInstalls } from "./discovery.js";

const installs = await discoverAdobeInstalls();
console.log(JSON.stringify({
  node: process.version,
  platform: process.platform,
  bridgePort: Number.parseInt(process.env.ADOBE_MCP_BRIDGE_PORT ?? "38470", 10),
  discoveredInstalls: installs,
  note: "Discovery only finds local install directories. Adobe MCP does not bypass licensing or activation."
}, null, 2));
