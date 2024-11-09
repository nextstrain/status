#!/usr/bin/env python3
import xml.etree.ElementTree as ET
from sys import argv, stdin, stdout

layer = argv[1]
doc = ET.parse(stdin)
root = doc.getroot()

for g in root.findall(".//{http://www.w3.org/2000/svg}g[@id]"):
    id = g.get("id")
    if id and id.startswith("layer-") and id not in {"layer-base", f"layer-{layer}"}:
        root.remove(g)

# I wish this preserved namespace names and original formatting and stuff, but
# alas, it doesn't seem possible to do so with this library.  At least we're
# only using this for build artifacts.
#   -trs, 8 Nov 2024
doc.write(stdout, encoding = "unicode", xml_declaration = True)
