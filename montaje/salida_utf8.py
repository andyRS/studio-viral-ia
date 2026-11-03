"""Progreso y errores de los trabajadores: UTF-8 también con Python -I en Windows."""
import sys


def configurar_salida():
    for flujo in (sys.stdout, sys.stderr):
        if hasattr(flujo, "reconfigure"):
            flujo.reconfigure(encoding="utf-8", errors="backslashreplace")
