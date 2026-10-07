/* Adobe MCP Acrobat folder-level adapter.
 * Runs outside document context so Net.HTTP can poll the localhost broker.
 */
var AdobeMCP = (function () {
    var BASE = "http://127.0.0.1:38470/adapter/acrobat";
    var busy = false;
    var lastHello = 0;
    var lastContext = 0;

    function streamToString(stream) {
        if (!stream) return "";
        try { return util.stringFromStream(stream, "utf-8"); }
        catch (_) {
            try { return SOAP.stringFromStream(stream); }
            catch (_) { return ""; }
        }
    }

    function request(verb, path, body, callback) {
        var args = {
            cVerb: verb,
            cURL: BASE + path,
            oHandler: {
                response: function (stream, uri, exception) {
                    var error = exception ? (exception.msg || String(exception)) : null;
                    callback(error, streamToString(stream));
                }
            }
        };
        if (body !== undefined && body !== null) {
            args.aHeaders = [{ name: "Content-Type", value: "application/json" }];
            args.oRequest = util.streamFromString(JSON.stringify(body), "utf-8");
        }
        try {
            app.beginPriv();
            Net.HTTP.request(args);
            app.endPriv();
        } catch (error) {
            try { app.endPriv(); } catch (_) {}
            callback(String(error), "");
        }
    }

    function activeDoc(params) {
        var docs = app.activeDocs || [];
        if (params && params.path) {
            for (var i = 0; i < docs.length; i++) {
                if (String(docs[i].path) === String(params.path)) return docs[i];
            }
        }
        if (!docs.length) throw new Error("no_open_pdf");
        return docs[0];
    }

    function docSummary(doc) {
        var info = {};
        try { info = doc.info || {}; } catch (_) {}
        return {
            path: doc.path || null,
            fileName: doc.documentFileName || null,
            numPages: doc.numPages,
            pageNum: doc.pageNum,
            numFields: doc.numFields,
            author: info.Author || info.author || null,
            title: info.Title || info.title || null,
            subject: info.Subject || info.subject || null,
            keywords: info.Keywords || info.keywords || null,
            dirty: doc.dirty === true
        };
    }

    function inspect() {
        var docs = app.activeDocs || [];
        var out = [];
        for (var i = 0; i < docs.length && i < 20; i++) out.push(docSummary(docs[i]));
        return {
            viewerType: app.viewerType,
            viewerVersion: app.viewerVersion,
            activeDocuments: out,
            documentCount: docs.length,
            truncated: docs.length > 20
        };
    }

    var dispatch = app.trustedFunction(function (op, params) {
        app.beginPriv();
        try {
            params = params || {};
            if (op !== "acrobat.pdf.automate") throw new Error("unsupported_operation:" + op);
            var operation = String(params.operation || "inspect");

            if (operation === "inspect") return inspect();

            if (operation === "open") {
                if (!params.path) throw new Error("path_required");
                var opened = app.openDoc({ cPath: String(params.path) });
                if (!opened) throw new Error("open_failed");
                return { opened: docSummary(opened) };
            }

            var doc = activeDoc(params);

            if (operation === "saveAs") {
                if (!params.outputPath) throw new Error("outputPath_required");
                doc.saveAs({ cPath: String(params.outputPath) });
                return { saved: String(params.outputPath), document: docSummary(doc) };
            }

            if (operation === "close") {
                var summary = docSummary(doc);
                doc.closeDoc(params.discardChanges === true);
                return { closed: summary.path, discarded: params.discardChanges === true };
            }

            if (operation === "insertPages") {
                if (!params.sourcePath) throw new Error("sourcePath_required");
                var afterPage = params.afterPage === undefined ? doc.numPages - 1 : Number(params.afterPage);
                var start = params.sourceStart === undefined ? 0 : Number(params.sourceStart);
                var end = params.sourceEnd === undefined ? undefined : Number(params.sourceEnd);
                var args = { nPage: afterPage, cPath: String(params.sourcePath), nStart: start };
                if (end !== undefined) args.nEnd = end;
                doc.insertPages(args);
                return { inserted: true, numPages: doc.numPages };
            }

            if (operation === "deletePages") {
                var deleteStart = params.start === undefined ? 0 : Number(params.start);
                var deleteEnd = params.end === undefined ? deleteStart : Number(params.end);
                doc.deletePages({ nStart: deleteStart, nEnd: deleteEnd });
                return { deleted: [deleteStart, deleteEnd], numPages: doc.numPages };
            }

            if (operation === "replacePages") {
                if (!params.sourcePath) throw new Error("sourcePath_required");
                doc.replacePages({
                    nPage: params.page === undefined ? 0 : Number(params.page),
                    cPath: String(params.sourcePath),
                    nStart: params.sourceStart === undefined ? 0 : Number(params.sourceStart),
                    nEnd: params.sourceEnd === undefined ? 0 : Number(params.sourceEnd)
                });
                return { replaced: true, numPages: doc.numPages };
            }

            if (operation === "extractPages") {
                if (!params.outputPath) throw new Error("outputPath_required");
                doc.extractPages({
                    nStart: params.start === undefined ? 0 : Number(params.start),
                    nEnd: params.end === undefined ? doc.numPages - 1 : Number(params.end),
                    cPath: String(params.outputPath)
                });
                return { extracted: String(params.outputPath) };
            }

            if (operation === "rotatePages") {
                var rotation = Number(params.rotation || 90);
                if (rotation !== 0 && rotation !== 90 && rotation !== 180 && rotation !== 270) throw new Error("rotation_must_be_0_90_180_270");
                var rotateStart = params.start === undefined ? 0 : Number(params.start);
                var rotateEnd = params.end === undefined ? doc.numPages - 1 : Number(params.end);
                doc.setPageRotations(rotateStart, rotateEnd, rotation);
                return { rotated: [rotateStart, rotateEnd], rotation: rotation };
            }

            if (operation === "watermarkText") {
                if (!params.text) throw new Error("text_required");
                doc.addWatermarkFromText({
                    cText: String(params.text),
                    nStart: params.start === undefined ? 0 : Number(params.start),
                    nEnd: params.end === undefined ? doc.numPages - 1 : Number(params.end),
                    nFontSize: params.fontSize === undefined ? 24 : Number(params.fontSize),
                    nRotation: params.rotation === undefined ? 0 : Number(params.rotation),
                    nOpacity: params.opacity === undefined ? 1 : Number(params.opacity),
                    bOnTop: params.onTop !== false,
                    nHorizValue: params.x === undefined ? 0 : Number(params.x),
                    nVertValue: params.y === undefined ? 0 : Number(params.y)
                });
                return { watermark: "text", pages: doc.numPages };
            }

            if (operation === "watermarkFile") {
                if (!params.sourcePath) throw new Error("sourcePath_required");
                doc.addWatermarkFromFile({
                    cDIPath: String(params.sourcePath),
                    nSourcePage: params.sourcePage === undefined ? 0 : Number(params.sourcePage),
                    nStart: params.start === undefined ? 0 : Number(params.start),
                    nEnd: params.end === undefined ? doc.numPages - 1 : Number(params.end),
                    nRotation: params.rotation === undefined ? 0 : Number(params.rotation),
                    nOpacity: params.opacity === undefined ? 1 : Number(params.opacity),
                    bOnTop: params.onTop !== false
                });
                return { watermark: "file", sourcePath: String(params.sourcePath) };
            }

            if (operation === "annotate") {
                var annot = doc.addAnnot({
                    page: params.page === undefined ? 0 : Number(params.page),
                    type: String(params.type || "Text"),
                    rect: params.rect || [72, 720, 200, 680],
                    contents: String(params.contents || ""),
                    author: params.author ? String(params.author) : undefined,
                    name: params.name ? String(params.name) : undefined
                });
                return { annotation: annot ? annot.name : null };
            }

            if (operation === "field.create") {
                if (!params.name) throw new Error("name_required");
                var field = doc.addField(
                    String(params.name),
                    String(params.fieldType || "text"),
                    params.page === undefined ? 0 : Number(params.page),
                    params.rect || [72, 720, 300, 690]
                );
                if (params.value !== undefined) field.value = params.value;
                if (params.userName !== undefined) field.userName = String(params.userName);
                if (params.readonly !== undefined) field.readonly = params.readonly === true;
                return { field: field.name, type: field.type };
            }

            if (operation === "field.set") {
                if (!params.name) throw new Error("name_required");
                var existing = doc.getField(String(params.name));
                if (!existing) throw new Error("field_not_found");
                if (params.value !== undefined) existing.value = params.value;
                if (params.userName !== undefined) existing.userName = String(params.userName);
                if (params.readonly !== undefined) existing.readonly = params.readonly === true;
                return { field: existing.name, value: existing.value };
            }

            if (operation === "flatten") {
                doc.flattenPages(
                    params.start === undefined ? 0 : Number(params.start),
                    params.end === undefined ? doc.numPages - 1 : Number(params.end),
                    params.nonPrint === true ? 1 : 0
                );
                return { flattened: true };
            }

            if (operation === "pageLabels") {
                if (!params.labels || !(params.labels instanceof Array)) throw new Error("labels_required");
                for (var li = 0; li < params.labels.length; li++) {
                    var label = params.labels[li];
                    doc.setPageLabels(Number(label.page || 0), [
                        String(label.style || "D"),
                        String(label.prefix || ""),
                        Number(label.start || 1)
                    ]);
                }
                return { labelsApplied: params.labels.length };
            }

            throw new Error("unsupported_acrobat_operation:" + operation);
        } finally {
            app.endPriv();
        }
    });

    function post(path, value) {
        request("POST", path, value, function () {});
    }

    function hello() {
        post("/hello", {
            appVersion: String(app.viewerVersion || ""),
            adapterVersion: "0.1.0",
            capabilities: ["acrobat.pdf.automate"]
        });
    }

    function context() {
        try { post("/event", { type: "event", event: "context", data: inspect() }); }
        catch (_) {}
    }

    function tick() {
        var now = new Date().getTime();
        if (now - lastHello > 5000) { hello(); lastHello = now; }
        if (now - lastContext > 5000) { context(); lastContext = now; }
        if (busy) return;
        busy = true;
        request("GET", "/poll", null, function (error, text) {
            busy = false;
            if (error || !text) return;
            var message;
            try { message = JSON.parse(text); } catch (_) { return; }
            if (!message || message.type !== "command" || !message.id) return;
            var ok = true, data = null, failure = null;
            try { data = dispatch(message.op, message.params || {}); }
            catch (e) { ok = false; failure = String(e); }
            post("/result", { type: "result", id: message.id, ok: ok, data: ok ? data : undefined, error: failure });
            if (ok) context();
        });
    }

    return { tick: tick, inspect: inspect };
})();

app.setInterval("AdobeMCP.tick()", 350);
