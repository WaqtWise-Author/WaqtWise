#!/usr/bin/env python3
"""Builds src/core/world-cities.json from a GeoNames-based list (lmfmaier/cities-json, cities500.json) and the
IANA zone.tab. Run only when the list should be refreshed:

  python3 tools/build-world-cities.py /path/to/cities500.json [min_population]

Every city with at least min_population (default 15000) is kept. Its time zone is the nearest zone.tab place of
the SAME country (exact for one-zone countries, a close guess for the few big multi-zone countries; the app shows
the zone so the person can see it)."""
import json, math, sys, re

src = sys.argv[1]
min_pop = int(sys.argv[2]) if len(sys.argv) > 2 else 15000
ZONE_TAB = '/usr/share/zoneinfo/zone.tab'

def coord(text):
    m = re.match(r'([+-])(\d{2})(\d{2})(\d{2})?([+-])(\d{3})(\d{2})(\d{2})?$', text)
    la = int(m.group(2)) + int(m.group(3)) / 60 + (int(m.group(4)) / 3600 if m.group(4) else 0)
    lo = int(m.group(6)) + int(m.group(7)) / 60 + (int(m.group(8)) / 3600 if m.group(8) else 0)
    return (la if m.group(1) == '+' else -la, lo if m.group(5) == '+' else -lo)

zones = {}
for line in open(ZONE_TAB, encoding='utf-8'):
    if line.startswith('#') or not line.strip():
        continue
    cc, c, tz = line.rstrip('\n').split('\t')[:3]
    zones.setdefault(cc, []).append((tz, *coord(c)))

def dist(a, b, c, d):
    p = math.pi / 180
    x = math.sin((c - a) * p / 2) ** 2 + math.cos(a * p) * math.cos(c * p) * math.sin((d - b) * p / 2) ** 2
    return math.asin(math.sqrt(x))

cities = json.load(open(src, encoding='utf-8'))
zone_ids = []
zone_index = {}
out = {}
for c in cities:
    pop = int(c.get('pop') or 0)
    cc = c['country']
    if pop < min_pop or cc not in zones:
        continue
    lat, lon = float(c['lat']), float(c['lon'])
    tz = min(zones[cc], key=lambda z: dist(lat, lon, z[1], z[2]))[0]
    if tz not in zone_index:
        zone_index[tz] = len(zone_ids)
        zone_ids.append(tz)
    out.setdefault(cc, []).append([c['name'].strip(), round(lat, 4), round(lon, 4), pop, (c.get('admin1') or '').strip(), zone_index[tz]])
for cc in out:
    out[cc].sort(key=lambda r: (-r[3], r[0]))
data = {'version': 1, 'minPopulation': min_pop, 'zones': zone_ids, 'countries': dict(sorted(out.items()))}
json.dump(data, open('src/core/world-cities.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(len(out), 'countries,', sum(len(v) for v in out.values()), 'cities,', len(zone_ids), 'zones')
