"""NVIDIA + system telemetry collector for ComfyUI-NVML-Monitor."""
from __future__ import annotations

import time
import threading
import warnings
from typing import Any

import psutil

with warnings.catch_warnings():
    warnings.simplefilter("ignore", FutureWarning)
    import pynvml


_LOCK = threading.Lock()
_CACHE: dict[str, Any] = {"ts": 0.0, "data": None}
_CACHE_TTL = 0.5

_NVML_READY = False
_NVML_ERROR: str | None = None
_GPU_HANDLES: list[Any] = []


def _init_nvml() -> None:
    global _NVML_READY, _NVML_ERROR, _GPU_HANDLES
    if _NVML_READY:
        return
    try:
        pynvml.nvmlInit()
        count = pynvml.nvmlDeviceGetCount()
        _GPU_HANDLES = [pynvml.nvmlDeviceGetHandleByIndex(i) for i in range(count)]
        _NVML_READY = True
        _NVML_ERROR = None
    except Exception as exc:
        _NVML_READY = False
        _NVML_ERROR = f"{type(exc).__name__}: {exc}"


def _as_str(value: Any) -> str:
    return value.decode() if isinstance(value, bytes) else str(value)


def _safe(fn, default=None):
    try:
        return fn()
    except Exception:
        return default


def _gpu_processes(handle) -> list[dict]:
    try:
        procs = pynvml.nvmlDeviceGetComputeRunningProcesses(handle)
    except Exception:
        return []
    out: list[dict] = []
    for p in procs[:10]:
        name = "unknown"
        try:
            name = psutil.Process(p.pid).name()
        except Exception:
            pass
        mem_mb = (p.usedGpuMemory or 0) / (1024 * 1024) if p.usedGpuMemory else 0
        out.append({"pid": p.pid, "name": name, "mem_mb": round(mem_mb, 1)})
    return out


def _gpu_stats(index: int, handle) -> dict:
    name = _as_str(_safe(lambda: pynvml.nvmlDeviceGetName(handle), "Unknown GPU"))
    mem = _safe(lambda: pynvml.nvmlDeviceGetMemoryInfo(handle))
    util = _safe(lambda: pynvml.nvmlDeviceGetUtilizationRates(handle))
    temp = _safe(lambda: pynvml.nvmlDeviceGetTemperature(handle, pynvml.NVML_TEMPERATURE_GPU))
    power_draw = _safe(lambda: pynvml.nvmlDeviceGetPowerUsage(handle) / 1000.0)
    power_limit = _safe(lambda: pynvml.nvmlDeviceGetPowerManagementLimit(handle) / 1000.0)
    clk_graphics = _safe(lambda: pynvml.nvmlDeviceGetClockInfo(handle, pynvml.NVML_CLOCK_GRAPHICS))
    clk_memory = _safe(lambda: pynvml.nvmlDeviceGetClockInfo(handle, pynvml.NVML_CLOCK_MEM))
    fan = _safe(lambda: pynvml.nvmlDeviceGetFanSpeed(handle))

    GB = 1024 ** 3
    vram = {
        "used_gb": round(mem.used / GB, 2) if mem else 0,
        "total_gb": round(mem.total / GB, 2) if mem else 0,
        "free_gb": round(mem.free / GB, 2) if mem else 0,
        "percent": round((mem.used / mem.total) * 100, 1) if mem and mem.total else 0,
    }

    procs = _gpu_processes(handle)
    visible_mb = sum(p["mem_mb"] for p in procs)
    total_used_mb = (mem.used / (1024 * 1024)) if mem else 0
    external_mb = max(0, total_used_mb - visible_mb)

    return {
        "index": index,
        "name": name,
        "vram": vram,
        "util": {
            "gpu": util.gpu if util else 0,
            "memory": util.memory if util else 0,
        },
        "temp_c": temp,
        "power": {
            "draw_w": round(power_draw, 1) if power_draw is not None else None,
            "limit_w": round(power_limit, 1) if power_limit is not None else None,
        },
        "clocks": {
            "graphics_mhz": clk_graphics,
            "memory_mhz": clk_memory,
        },
        "fan_percent": fan,
        "processes": procs,
        "external_mb": round(external_mb, 1),
    }


def _system_stats() -> dict:
    vm = psutil.virtual_memory()
    GB = 1024 ** 3
    return {
        "cpu": {
            "percent": round(psutil.cpu_percent(interval=None), 1),
            "cores": [round(x, 1) for x in psutil.cpu_percent(interval=None, percpu=True)],
            "count": psutil.cpu_count(logical=True),
        },
        "ram": {
            "used_gb": round((vm.total - vm.available) / GB, 2),
            "total_gb": round(vm.total / GB, 2),
            "percent": round(vm.percent, 1),
        },
    }


def collect() -> dict:
    now = time.time()
    with _LOCK:
        if _CACHE["data"] is not None and (now - _CACHE["ts"]) < _CACHE_TTL:
            return _CACHE["data"]

        _init_nvml()
        driver = ""
        gpus: list[dict] = []
        if _NVML_READY:
            try:
                driver = _as_str(pynvml.nvmlSystemGetDriverVersion())
            except Exception:
                driver = ""
            for i, h in enumerate(_GPU_HANDLES):
                gpus.append(_gpu_stats(i, h))

        data = {
            "ts": now,
            "provider": "NVIDIA" if _NVML_READY else "unavailable",
            "driver": driver,
            "nvml_error": _NVML_ERROR,
            **_system_stats(),
            "gpus": gpus,
        }
        _CACHE["ts"] = now
        _CACHE["data"] = data
        return data


def shutdown() -> None:
    global _NVML_READY
    if _NVML_READY:
        try:
            pynvml.nvmlShutdown()
        except Exception:
            pass
        _NVML_READY = False
