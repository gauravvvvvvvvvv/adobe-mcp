# Universal CEP adapter

One CEP extension currently targets:

- Premiere Pro
- After Effects
- Illustrator
- InDesign

It detects the active host and registers only that app's capabilities with the local Adobe MCP broker.

## Why one CEP adapter

All four hosts can execute their native ExtendScript surface from a CEP panel. Sharing the transport gives us:

- one reconnect implementation
- one install location
- one serialized `evalScript` queue
- the same command/result protocol as Photoshop UXP
- smaller maintenance surface

The adapter never fires overlapping `evalScript` calls. They are serialized because overlapping host calls can make CEP/ExtendScript unreliable.

## Current handlers

Each host has compact context inspection. Other semantic operations can temporarily carry an internal `script` parameter while typed compilers are implemented in the MCP/runtime.

The user-facing model should not normally generate raw ExtendScript. The intended end state is that capabilities such as `premiere.timeline.edit` compile into host scripts inside the adapter/runtime.

## Installation

This is currently a development CEP extension. Copy this directory into a CEP extensions directory and enable CEP debug mode for local unsigned development. Packaging/install helpers will be added manually in a later commit; there is intentionally no CI workflow.

Once the extension is loaded, its WebSocket reconnect loop means the MCP server may be started before or after the Adobe host.
