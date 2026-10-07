# Acrobat adapter

Adobe MCP installs a folder-level Acrobat JavaScript. Folder-level code is required because Acrobat's `Net.HTTP.request` is security-restricted outside trusted application context.

The script polls the local Adobe MCP broker and exposes `acrobat.pdf.automate` operations:

- inspect/open/saveAs/close
- insert/delete/replace/extract/rotate pages
- text or file watermarks
- annotations
- form-field create/update
- flatten pages
- page-label schemes

This adapter targets **Acrobat**, not the free Reader. Several document mutation APIs and HTTP privileges are unavailable or restricted in Reader.

After the folder script is installed, restart Acrobat once so it loads the script. Subsequent MCP restarts do not require restarting Acrobat.
