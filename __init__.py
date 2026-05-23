"""ComfyUI-NVML-Monitor — NVIDIA + system telemetry chip and popup."""
from aiohttp import web
from server import PromptServer

from .monitor import collect

WEB_DIRECTORY = "./web"
NODE_CLASS_MAPPINGS: dict = {}
NODE_DISPLAY_NAME_MAPPINGS: dict = {}


@PromptServer.instance.routes.get("/nvml_monitor/stats")
async def _stats(_request):
    return web.json_response(collect())


__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
