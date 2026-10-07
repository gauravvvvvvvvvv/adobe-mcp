"""Adobe MCP startup plugin for Substance 3D Painter.

Loaded from python/startup so the bridge comes online with Painter and reconnects
to the same local MCP broker without requiring an MCP restart.
"""
import json
import traceback

import substance_painter as sp

if sp.application.version_info() < (10, 1, 0):
    from PySide2.QtCore import QTimer, QUrl
    from PySide2.QtWebSockets import QWebSocket
else:
    from PySide6.QtCore import QTimer, QUrl
    from PySide6.QtWebSockets import QWebSocket

WS_URL = "ws://127.0.0.1:38470"
CAPABILITIES = ["substance-3d.project.automate"]
_socket = None
_reconnect_timer = None
_context_timer = None
_connecting = False
_started = False


def _enum_name(value):
    return getattr(value, "name", str(value))


def _jsonable(value):
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, dict):
        return {str(k): _jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_jsonable(v) for v in value]
    if hasattr(value, "url") and callable(value.url):
        try:
            return value.url()
        except Exception:
            pass
    if hasattr(value, "name"):
        try:
            name = value.name
            return name() if callable(name) else str(name)
        except Exception:
            pass
    return str(value)


def _send(message):
    if _socket is not None and _socket.isValid():
        _socket.sendTextMessage(json.dumps(_jsonable(message), separators=(",", ":")))


def _node_summary(node, depth=0):
    result = {
        "uid": node.uid(),
        "name": node.get_name(),
        "type": _enum_name(node.get_type()),
        "visible": node.is_visible(),
    }
    if depth < 2 and isinstance(node, sp.layerstack.GroupLayerNode):
        result["children"] = [_node_summary(child, depth + 1) for child in node.sub_layers()[:50]]
        result["truncated"] = len(node.sub_layers()) > 50
    return result


def _stack_summary(stack):
    texture_set = stack.material()
    root = sp.layerstack.get_root_layer_nodes(stack)
    channels = {}
    for channel_type, channel in stack.all_channels().items():
        channels[_enum_name(channel_type)] = {
            "label": channel.label(),
            "format": _enum_name(channel.format()),
            "bitDepth": channel.bit_depth(),
        }
    return {
        "name": stack.name(),
        "textureSet": texture_set.name,
        "channels": channels,
        "rootLayers": [_node_summary(node) for node in root[:100]],
        "truncated": len(root) > 100,
    }


def _inspect():
    version = sp.application.version_info()
    result = {
        "appVersion": ".".join(str(part) for part in version),
        "projectOpen": sp.project.is_open(),
    }
    if not sp.project.is_open():
        return result

    sets = []
    for texture_set in sp.textureset.all_texture_sets():
        resolution = texture_set.get_resolution()
        sets.append({
            "name": texture_set.name,
            "originalName": texture_set.original_name,
            "resolution": {"width": resolution.width, "height": resolution.height},
            "layered": texture_set.is_layered_material(),
            "stacks": [stack.name() for stack in texture_set.all_stacks()],
        })

    active = sp.textureset.get_active_stack()
    result.update({
        "project": {
            "name": sp.project.name(),
            "path": sp.project.file_path(),
            "needsSaving": sp.project.needs_saving(),
            "uuid": str(sp.project.get_uuid()),
        },
        "textureSets": sets,
        "activeStack": _stack_summary(active) if active else None,
    })
    return result


def _resolve_stack(params):
    texture_set_name = params.get("textureSet")
    stack_name = params.get("stack", "")
    if texture_set_name:
        return sp.textureset.Stack.from_name(str(texture_set_name), str(stack_name))
    stack = sp.textureset.get_active_stack()
    if stack is None:
        raise RuntimeError("no_active_texture_stack")
    return stack


def _find_node(params):
    stack = _resolve_stack(params)
    uid = params.get("uid")
    name = params.get("name")

    if uid is not None:
        node = sp.layerstack.get_node_by_uid(int(uid))
        if node is None:
            raise RuntimeError("layer_node_not_found")
        return node

    def visit(nodes):
        for node in nodes:
            if name is not None and node.get_name() == str(name):
                return node
            if isinstance(node, sp.layerstack.GroupLayerNode):
                found = visit(node.sub_layers())
                if found is not None:
                    return found
        return None

    found = visit(sp.layerstack.get_root_layer_nodes(stack))
    if found is None:
        raise RuntimeError("layer_node_not_found")
    return found


def _resource_summary(resource):
    identifier = resource.identifier()
    usages = []
    try:
        usages = [_enum_name(usage) for usage in resource.usages()]
    except Exception:
        pass
    return {
        "name": resource.gui_name(),
        "identifier": identifier.url(),
        "context": getattr(identifier, "context", None),
        "resourceName": getattr(identifier, "name", None),
        "version": getattr(identifier, "version", None),
        "usages": usages,
    }


def _export_result(result):
    textures = []
    for key, paths in result.textures.items():
        textures.append({"stack": _jsonable(key), "files": list(paths)})
    return {
        "status": _enum_name(result.status),
        "message": result.message,
        "textures": textures,
    }


def _dispatch(op, params):
    if op != "substance-3d.project.automate":
        raise RuntimeError("unsupported_operation:" + str(op))
    params = params or {}
    operation = str(params.get("operation", "inspect"))

    if operation == "inspect":
        return _inspect()

    if operation == "project.open":
        path = params.get("path")
        if not path:
            raise RuntimeError("path_required")
        sp.project.open(str(path))
        return _inspect()

    if operation == "project.create":
        mesh_path = params.get("meshPath")
        if not mesh_path:
            raise RuntimeError("meshPath_required")
        settings_kwargs = {}
        if params.get("defaultTextureResolution") is not None:
            settings_kwargs["default_texture_resolution"] = int(params["defaultTextureResolution"])
        if params.get("importCameras") is not None:
            settings_kwargs["import_cameras"] = bool(params["importCameras"])
        if params.get("meshUnitScale") is not None:
            settings_kwargs["mesh_unit_scale"] = float(params["meshUnitScale"])
        settings = sp.project.Settings(**settings_kwargs) if settings_kwargs else None
        kwargs = {"mesh_file_path": str(mesh_path)}
        if params.get("templatePath"):
            kwargs["template_file_path"] = str(params["templatePath"])
        if settings is not None:
            kwargs["settings"] = settings
        sp.project.create(**kwargs)
        return _inspect()

    if operation == "project.save":
        sp.project.save()
        return {"saved": sp.project.file_path(), "needsSaving": sp.project.needs_saving()}

    if operation == "project.saveAs":
        path = params.get("path")
        if not path:
            raise RuntimeError("path_required")
        sp.project.save_as(str(path))
        return {"saved": sp.project.file_path()}

    if operation == "project.saveCopy":
        path = params.get("path")
        if not path:
            raise RuntimeError("path_required")
        sp.project.save_as_copy(str(path))
        return {"copy": str(path), "activeProject": sp.project.file_path()}

    if operation == "project.close":
        if params.get("save") is True and sp.project.needs_saving():
            sp.project.save()
        sp.project.close()
        return {"closed": True}

    if not sp.project.is_open():
        raise RuntimeError("no_open_project")

    if operation == "texturesets.inspect":
        return _inspect()["textureSets"]

    if operation == "textureset.resolution":
        name = params.get("textureSet")
        if not name:
            raise RuntimeError("textureSet_required")
        texture_set = sp.textureset.TextureSet.from_name(str(name))
        width = int(params.get("width", params.get("size", 2048)))
        height = int(params.get("height", params.get("size", width)))
        texture_set.set_resolution(sp.textureset.Resolution(width, height))
        resolution = texture_set.get_resolution()
        return {"textureSet": texture_set.name, "width": resolution.width, "height": resolution.height}

    if operation == "layers.inspect":
        return _stack_summary(_resolve_stack(params))

    if operation in ("layer.fill", "layer.paint", "layer.group"):
        stack = _resolve_stack(params)
        position = sp.layerstack.InsertPosition.from_textureset_stack(stack)
        with sp.layerstack.ScopedModification("Adobe MCP: " + operation):
            if operation == "layer.fill":
                node = sp.layerstack.insert_fill(position)
                material_query = params.get("materialQuery")
                if material_query:
                    matches = sp.resource.search(str(material_query))
                    if not matches:
                        raise RuntimeError("material_resource_not_found")
                    node.set_material_source(matches[0].identifier())
            elif operation == "layer.paint":
                node = sp.layerstack.insert_paint(position)
            else:
                node = sp.layerstack.insert_group(position)
                if params.get("collapsed") is not None:
                    node.set_collapsed(bool(params["collapsed"]))
            if params.get("name"):
                node.set_name(str(params["name"]))
            if params.get("visible") is not None:
                node.set_visible(bool(params["visible"]))
        return _node_summary(node)

    if operation == "layer.set":
        node = _find_node(params)
        with sp.layerstack.ScopedModification("Adobe MCP: layer properties"):
            if params.get("newName") is not None:
                node.set_name(str(params["newName"]))
            if params.get("visible") is not None:
                node.set_visible(bool(params["visible"]))
            channel_name = params.get("channel")
            channel = None
            if channel_name:
                channel = getattr(sp.textureset.ChannelType, str(channel_name), None)
                if channel is None:
                    raise RuntimeError("unknown_channel:" + str(channel_name))
            if params.get("opacity") is not None:
                node.set_opacity(max(0.0, min(1.0, float(params["opacity"]))), channel)
            if params.get("blendingMode") is not None:
                mode = getattr(sp.layerstack.BlendingMode, str(params["blendingMode"]), None)
                if mode is None:
                    raise RuntimeError("unknown_blending_mode:" + str(params["blendingMode"]))
                node.set_blending_mode(mode, channel)
        return _node_summary(node)

    if operation == "layer.material":
        node = _find_node(params)
        if not isinstance(node, sp.layerstack.FillLayerNode):
            raise RuntimeError("target_is_not_fill_layer")
        query = params.get("query")
        if not query:
            raise RuntimeError("query_required")
        matches = sp.resource.search(str(query))
        if not matches:
            raise RuntimeError("material_resource_not_found")
        with sp.layerstack.ScopedModification("Adobe MCP: material"):
            node.set_material_source(matches[0].identifier())
        return {"layer": _node_summary(node), "material": _resource_summary(matches[0])}

    if operation == "resource.search":
        query = params.get("query")
        if not query:
            raise RuntimeError("query_required")
        limit = max(1, min(100, int(params.get("limit", 20))))
        results = sp.resource.search(str(query))
        return {
            "results": [_resource_summary(resource) for resource in results[:limit]],
            "total": len(results),
            "truncated": len(results) > limit,
        }

    if operation == "resource.project":
        resources = sp.resource.list_project_resources()
        return {"resources": [_jsonable(resource) for resource in resources]}

    if operation in ("export.preview", "export.textures"):
        config = dict(params.get("config") or {})
        if params.get("outputDir"):
            config["exportPath"] = str(params["outputDir"])
        if params.get("presetQuery"):
            matches = sp.resource.search(str(params["presetQuery"]))
            if not matches:
                raise RuntimeError("export_preset_not_found")
            config["defaultExportPreset"] = matches[0].identifier().url()
        elif params.get("presetUrl"):
            config["defaultExportPreset"] = str(params["presetUrl"])
        if "exportPath" not in config:
            config["exportPath"] = sp.export.get_default_export_path()
        if "exportList" not in config:
            config["exportList"] = [{"rootPath": texture_set.name} for texture_set in sp.textureset.all_texture_sets()]
        if "exportParameters" not in config:
            config["exportParameters"] = [{
                "parameters": {
                    "fileFormat": str(params.get("fileFormat", "png")),
                    "bitDepth": str(params.get("bitDepth", "8")),
                    "dithering": bool(params.get("dithering", True)),
                    "paddingAlgorithm": str(params.get("paddingAlgorithm", "infinite")),
                }
            }]
        if operation == "export.preview":
            planned = sp.export.list_project_textures(config)
            return {"config": config, "planned": _jsonable(planned)}
        result = sp.export.export_project_textures(config)
        return {"config": config, "result": _export_result(result)}

    if operation == "python.evaluate":
        # Explicit advanced escape hatch inside Painter's own Python runtime.
        # Disabled unless the caller opts in for a one-off host-specific gap.
        if params.get("allow") is not True:
            raise RuntimeError("python_evaluate_requires_allow_true")
        source = params.get("source")
        if not isinstance(source, str) or not source.strip():
            raise RuntimeError("source_required")
        namespace = {"sp": sp}
        exec(source, namespace, namespace)
        return {"success": True, "result": _jsonable(namespace.get("result"))}

    raise RuntimeError("unsupported_substance_operation:" + operation)


def _schedule_reconnect():
    global _connecting
    _connecting = False
    if _reconnect_timer is not None and not _reconnect_timer.isActive():
        _reconnect_timer.start(750)


def _on_connected():
    global _connecting
    _connecting = False
    _send({
        "type": "hello",
        "app": "substance-3d",
        "appVersion": sp.application.version(),
        "adapterVersion": "0.1.0",
        "capabilities": CAPABILITIES,
    })
    _send({"type": "event", "event": "context", "data": _inspect()})


def _on_message(text):
    try:
        message = json.loads(text)
    except Exception:
        return
    if message.get("type") != "command" or not message.get("id"):
        return
    try:
        data = _dispatch(message.get("op"), message.get("params") or {})
        _send({"type": "result", "id": message["id"], "ok": True, "data": data})
        try:
            _send({"type": "event", "event": "context", "data": _inspect()})
        except Exception:
            pass
    except Exception as error:
        _send({
            "type": "result",
            "id": message["id"],
            "ok": False,
            "error": str(error),
            "data": {"trace": traceback.format_exc(limit=4)},
        })


def _connect():
    global _connecting
    if not _started or _connecting or (_socket is not None and _socket.isValid()):
        return
    _connecting = True
    _socket.open(QUrl(WS_URL))


def _send_context():
    if _socket is not None and _socket.isValid():
        try:
            _send({"type": "event", "event": "context", "data": _inspect()})
        except Exception:
            pass


def start_plugin():
    global _socket, _reconnect_timer, _context_timer, _started
    if _started:
        return
    _started = True
    _socket = QWebSocket()
    _reconnect_timer = QTimer()
    _reconnect_timer.setSingleShot(True)
    _reconnect_timer.timeout.connect(_connect)
    _context_timer = QTimer()
    _context_timer.setInterval(5000)
    _context_timer.timeout.connect(_send_context)

    _socket.connected.connect(_on_connected)
    _socket.textMessageReceived.connect(_on_message)
    _socket.disconnected.connect(_schedule_reconnect)
    try:
        _socket.errorOccurred.connect(lambda _error: _schedule_reconnect())
    except Exception:
        try:
            _socket.error.connect(lambda _error: _schedule_reconnect())
        except Exception:
            pass

    _context_timer.start()
    _connect()


def close_plugin():
    global _started, _socket, _reconnect_timer, _context_timer, _connecting
    _started = False
    _connecting = False
    if _context_timer is not None:
        _context_timer.stop()
    if _reconnect_timer is not None:
        _reconnect_timer.stop()
    if _socket is not None:
        try:
            _socket.close()
        except Exception:
            pass
        _socket = None
    _context_timer = None
    _reconnect_timer = None


if __name__ == "__main__":
    start_plugin()
