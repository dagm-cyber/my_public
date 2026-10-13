"""Build static map data for the Haugesund "Fill the Map" street scopes.

Fetches data for Haugesund kommune from OpenStreetMap (Overpass API) and writes:

  data/haugesund-streets-kommune.json  - every named street (one feature per name)
  data/haugesund-streets-sentrum.json  - streets mostly inside the centre box
  data/haugesund-context.json          - background context: land (from the
                                         coastline), lakes, green areas,
                                         buildings and named places/landmarks

Labels whose name contains a street name are dropped so the background never
gives away an answer.

Map data (c) OpenStreetMap contributors, ODbL 1.0.

Requires: shapely  (pip install shapely)
Usage:    python tools/build_haugesund_map.py [--cache DIR]
"""
import argparse
import json
import math
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

from shapely import STRtree
from shapely.geometry import LineString, MultiPolygon, Point, Polygon, box, mapping
from shapely.ops import linemerge, polygonize, unary_union

OVERPASS_URL = 'https://overpass-api.de/api/interpreter'
AREA = 'area["boundary"="administrative"]["admin_level"="7"]["name"="Haugesund"]->.a;'

HIGHWAY_TYPES = (
    'motorway|trunk|primary|secondary|tertiary|unclassified|residential|'
    'living_street|pedestrian|road|'
    'motorway_link|trunk_link|primary_link|secondary_link|tertiary_link'
)

STREETS_QUERY = f"""
[out:json][timeout:180];
{AREA}
way(area.a)["highway"~"^({HIGHWAY_TYPES})$"]["name"];
out tags geom;
"""

CONTEXT_QUERY = f"""
[out:json][timeout:240];
{AREA}
(
  way(area.a)["building"];
  way(area.a)["natural"="water"]; relation(area.a)["natural"="water"];
  way(area.a)["leisure"~"^(park|pitch|stadium|garden)$"];
  way(area.a)["landuse"~"^(grass|forest|meadow|cemetery|recreation_ground)$"];
  way(area.a)["natural"~"^(wood|heath|scrub)$"];
  nwr(area.a)["name"]["amenity"~"^(townhall|place_of_worship|theatre|cinema|library|hospital|school|college|university|arts_centre|bus_station|ferry_terminal|police|fire_station)$"];
  nwr(area.a)["name"]["tourism"~"^(attraction|museum|gallery|hotel)$"];
  nwr(area.a)["name"]["leisure"~"^(park|stadium|sports_centre|ice_rink)$"];
  nwr(area.a)["name"]["shop"="mall"];
  node(area.a)["place"~"^(village|suburb|neighbourhood|hamlet|island|islet)$"]["name"];
  way(area.a)["place"~"^(island|islet)$"]["name"];
  nwr(area.a)["name"]["natural"~"^(water|bay|strait)$"];
  way(area.a)["name"]["building"~"^(church|chapel|cathedral|civic|public|office|commercial|hotel|train_station)$"];
);
out tags geom;
"""

# Coastline is fetched by bounding box (not by area) so the opposite shore of
# Karmsundet, which belongs to another kommune, is still drawn as land.
COAST_QUERY = """
[out:json][timeout:180];
way["natural"="coastline"]({s},{w},{n},{e});
out geom;
"""

# Haugesund sentrum (the grid between Smedasundet and Karmsundgata).
SENTRUM_BBOX = {'south': 59.4045, 'west': 5.2560, 'north': 59.4185, 'east': 5.2800}
SENTRUM_MIN_SHARE = 0.5  # share of a street's points that must be inside the box

# Label kind → minimum zoom at which the label is shown.
LABEL_MIN_ZOOM = {
    'village': 11, 'suburb': 12, 'strait': 12, 'bay': 12,
    'neighbourhood': 14, 'hamlet': 14, 'island': 13, 'islet': 15, 'lake': 14,
    'landmark': 15, 'minor': 16, 'school': 16, 'sport': 16, 'building': 17,
}

# Landmarks shown from zoom 15; the rest of the named buildings appear from 16.
MAJOR_AMENITY = {'townhall', 'place_of_worship', 'theatre', 'cinema', 'library', 'hospital',
                 'university', 'bus_station', 'ferry_terminal'}
MINOR_AMENITY = {'arts_centre', 'college', 'police', 'fire_station'}
MAJOR_TOURISM = {'attraction', 'museum'}
MINOR_TOURISM = {'gallery', 'hotel'}
BUILDING_LABEL_TYPES = {'church', 'chapel', 'cathedral', 'civic', 'public', 'office',
                        'commercial', 'hotel', 'train_station'}

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, 'data')
PREC = 5  # ~1 m


# ── Overpass ────────────────────────────────────────────────────────────────

def overpass(query, cache_dir, cache_name):
    if cache_dir:
        path = os.path.join(cache_dir, cache_name)
        if os.path.exists(path):
            with open(path, encoding='utf-8') as fh:
                return json.load(fh)
    body = urllib.parse.urlencode({'data': query}).encode()
    req = urllib.request.Request(OVERPASS_URL, data=body,
                                 headers={'User-Agent': 'GeoQuiz-Spill_Geo/1.0'})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=300) as res:
                data = json.load(res)
            break
        except urllib.error.HTTPError as err:
            if err.code not in (429, 502, 503, 504) or attempt == 3:
                raise
            wait = 20 * (attempt + 1)
            print(f'Overpass busy ({err.code}), retrying in {wait} s...')
            time.sleep(wait)
    if cache_dir:
        os.makedirs(cache_dir, exist_ok=True)
        with open(os.path.join(cache_dir, cache_name), 'w', encoding='utf-8') as fh:
            json.dump(data, fh, ensure_ascii=False)
    return data


def way_coords(el):
    return [(p['lon'], p['lat']) for p in el.get('geometry', [])]


def element_polygon(el):
    """Polygon for a closed way or a multipolygon relation, else None."""
    if el['type'] == 'way':
        pts = way_coords(el)
        if len(pts) >= 4 and pts[0] == pts[-1]:
            poly = Polygon(pts)
            return poly if poly.is_valid else poly.buffer(0)
        return None
    if el['type'] == 'relation':
        outers, inners = [], []
        for m in el.get('members', []):
            if m.get('type') != 'way' or 'geometry' not in m:
                continue
            line = [(p['lon'], p['lat']) for p in m['geometry']]
            (inners if m.get('role') == 'inner' else outers).append(LineString(line))
        polys = list(polygonize(linemerge(outers))) if outers else []
        if not polys:
            return None
        shape = unary_union(polys)
        if inners:
            holes = list(polygonize(linemerge(inners)))
            if holes:
                shape = shape.difference(unary_union(holes))
        return shape
    return None


def element_point(el):
    if el['type'] == 'node':
        return el['lon'], el['lat']
    poly = element_polygon(el)
    if poly is not None and not poly.is_empty:
        p = poly.representative_point()
        return p.x, p.y
    b = el.get('bounds')
    if b:
        return (b['minlon'] + b['maxlon']) / 2, (b['minlat'] + b['maxlat']) / 2
    pts = way_coords(el)
    if pts:
        return sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)
    return None


# ── Streets ─────────────────────────────────────────────────────────────────

def build_streets(elements):
    streets = {}
    for el in elements:
        if el.get('type') != 'way' or 'geometry' not in el:
            continue
        name = el['tags'].get('name', '').strip()
        line = [[round(lon, PREC), round(lat, PREC)] for lon, lat in way_coords(el)]
        if name and len(line) >= 2:
            streets.setdefault(name, []).append(line)
    return [{
        'type': 'Feature',
        'properties': {'name': name},
        'geometry': {'type': 'MultiLineString', 'coordinates': streets[name]},
    } for name in sorted(streets, key=str.casefold)]


def in_box(lat, lon, b):
    return b['south'] <= lat <= b['north'] and b['west'] <= lon <= b['east']


def sentrum_subset(features):
    out = []
    for f in features:
        pts = [p for line in f['geometry']['coordinates'] for p in line]
        inside = sum(1 for lon, lat in pts if in_box(lat, lon, SENTRUM_BBOX))
        if pts and inside / len(pts) >= SENTRUM_MIN_SHARE:
            out.append(f)
    return out


def streets_bbox(features, margin_lon=0.02, margin_lat=0.02):
    lons = [p[0] for f in features for line in f['geometry']['coordinates'] for p in line]
    lats = [p[1] for f in features for line in f['geometry']['coordinates'] for p in line]
    return (min(lons) - margin_lon, min(lats) - margin_lat,
            max(lons) + margin_lon, max(lats) + margin_lat)


# ── Land from coastline ─────────────────────────────────────────────────────

def build_land(coast_elements, frame_bounds):
    """Polygonise coastline + frame and keep faces on the left of the coastline
    (OSM convention: land is on the left-hand side of a natural=coastline way)."""
    frame = box(*frame_bounds)
    lines = [LineString(way_coords(el)) for el in coast_elements if len(el.get('geometry', [])) >= 2]
    if not lines:
        return frame
    coast = linemerge(lines)
    noded = unary_union([coast.intersection(frame), frame.exterior])
    faces = [f for f in polygonize(noded) if f.area > 0]
    tree = STRtree(faces)
    votes = [0] * len(faces)

    eps = 1e-6
    for ln in lines:
        coords = list(ln.coords)
        step = max(1, len(coords) // 50)
        for i in range(0, len(coords) - 1, step):
            (x1, y1), (x2, y2) = coords[i], coords[i + 1]
            dx, dy = x2 - x1, y2 - y1
            length = math.hypot(dx, dy)
            if length == 0:
                continue
            mx, my = (x1 + x2) / 2, (y1 + y2) / 2
            nx, ny = -dy / length * eps, dx / length * eps  # left-hand normal
            for sign, vote in ((1, 1), (-1, -1)):
                p = Point(mx + sign * nx, my + sign * ny)
                for idx in tree.query(p, predicate='within'):
                    votes[idx] += vote

    land = [f for f, v in zip(faces, votes) if v > 0]
    return unary_union(land) if land else Polygon()


# ── Context ─────────────────────────────────────────────────────────────────

def classify_label(tags):
    place = tags.get('place')
    if place in ('village', 'suburb', 'neighbourhood', 'hamlet', 'island', 'islet'):
        return place
    nat = tags.get('natural')
    if nat == 'water':
        return 'lake'
    if nat in ('strait', 'bay'):
        return nat
    if tags.get('amenity') == 'school' or tags.get('building') == 'school':
        return 'school'
    if tags.get('leisure') in ('stadium', 'sports_centre', 'ice_rink'):
        return 'sport'
    amenity, tourism = tags.get('amenity'), tags.get('tourism')
    if (amenity in MAJOR_AMENITY or tourism in MAJOR_TOURISM
            or tags.get('shop') == 'mall' or tags.get('leisure') == 'park'):
        return 'landmark'
    if amenity in MINOR_AMENITY or tourism in MINOR_TOURISM:
        return 'minor'
    if amenity or tourism or 'shop' in tags:
        return None  # cafés, pubs, ordinary shops etc.
    if tags.get('building') in BUILDING_LABEL_TYPES:
        return 'building'
    return None


KIND_PRIORITY = ['village', 'suburb', 'strait', 'bay', 'island', 'neighbourhood', 'hamlet',
                 'landmark', 'lake', 'islet', 'minor', 'sport', 'school', 'building']


def build_labels(elements, street_names):
    street_rx = re.compile(
        r'(?<!\w)(' + '|'.join(re.escape(s.casefold()) for s in
                               sorted(street_names, key=len, reverse=True)) + r')(?!\w)')
    labels = []
    for el in elements:
        tags = el.get('tags', {})
        name = tags.get('name', '').strip()
        if not name:
            continue
        kind = classify_label(tags)
        if not kind or street_rx.search(name.casefold()):
            continue
        pt = element_point(el)
        if not pt:
            continue
        labels.append({'name': name, 'kind': kind, 'lon': pt[0], 'lat': pt[1]})

    labels.sort(key=lambda l: KIND_PRIORITY.index(l['kind']))
    kept = []
    for lab in labels:
        dup = any(k['name'] == lab['name'] and
                  abs(k['lat'] - lab['lat']) < 0.004 and abs(k['lon'] - lab['lon']) < 0.008
                  for k in kept)
        if not dup:
            kept.append(lab)
    return [{
        'name': l['name'], 'kind': l['kind'], 'minZoom': LABEL_MIN_ZOOM[l['kind']],
        'lat': round(l['lat'], PREC), 'lon': round(l['lon'], PREC),
    } for l in kept]


def round_geom(geom, simplify=0.0):
    if simplify:
        geom = geom.simplify(simplify, preserve_topology=True)

    def rnd(obj):
        if isinstance(obj, (list, tuple)):
            if obj and isinstance(obj[0], (int, float)):
                return [round(obj[0], PREC), round(obj[1], PREC)]
            return [rnd(o) for o in obj]
        return obj
    m = mapping(geom)
    return {'type': m['type'], 'coordinates': rnd(m['coordinates'])}


def polygons_of(geom):
    if geom.is_empty:
        return []
    if isinstance(geom, Polygon):
        return [geom]
    if isinstance(geom, MultiPolygon):
        return list(geom.geoms)
    return [g for g in getattr(geom, 'geoms', []) if isinstance(g, Polygon)]


def collection(geoms, simplify=0.0):
    feats = []
    for g in geoms:
        for poly in polygons_of(g):
            r = round_geom(poly, simplify)
            if r['coordinates'] and len(r['coordinates'][0]) >= 4:
                feats.append(r)
    return feats


def encode_buildings(geoms, origin):
    """Compact building outlines: each ring is a flat integer list
    [x0, y0, dx1, dy1, ...] in 1e-5 degree units relative to `origin`.
    Holes are dropped (irrelevant at building scale)."""
    ox, oy = origin
    scale = 10 ** PREC
    rings = []
    for g in geoms:
        for poly in polygons_of(g):
            coords = list(poly.exterior.coords)[:-1]
            pts = [(round((x - ox) * scale), round((y - oy) * scale)) for x, y in coords]
            dedup = [p for i, p in enumerate(pts) if i == 0 or p != pts[i - 1]]
            if len(dedup) < 3:
                continue
            flat = [dedup[0][0], dedup[0][1]]
            for (px, py), (qx, qy) in zip(dedup, dedup[1:]):
                flat += [qx - px, qy - py]
            rings.append(flat)
    return {'origin': [round(ox, PREC), round(oy, PREC)], 'scale': scale, 'rings': rings}


def build_context(ctx_elements, coast_elements, frame_bounds, street_names):
    buildings, water, green = [], [], []
    for el in ctx_elements:
        tags = el.get('tags', {})
        if el['type'] == 'node':
            continue
        is_label_only = 'name' in tags and ('place' in tags or tags.get('natural') in ('bay', 'strait'))
        if is_label_only:
            continue
        poly = element_polygon(el)
        if poly is None or poly.is_empty:
            continue
        if 'building' in tags:
            buildings.append(poly)
        elif tags.get('natural') == 'water':
            water.append(poly)
        else:
            green.append(poly)

    land = build_land(coast_elements, frame_bounds)
    return {
        'attribution': '(c) OpenStreetMap contributors, ODbL 1.0',
        'bounds': [[frame_bounds[1], frame_bounds[0]], [frame_bounds[3], frame_bounds[2]]],
        'land': collection([land], simplify=0.00002),
        'water': collection(water, simplify=0.00002),
        'green': collection(green, simplify=0.00002),
        'buildings': encode_buildings(buildings, (frame_bounds[0], frame_bounds[1])),
        'labels': build_labels(ctx_elements, street_names),
    }


# ── Output ──────────────────────────────────────────────────────────────────

def write_json(name, obj):
    path = os.path.join(OUT_DIR, name)
    with open(path, 'w', encoding='utf-8') as fh:
        json.dump(obj, fh, ensure_ascii=False, separators=(',', ':'))
    print(f'data/{name}: {os.path.getsize(path) / 1024:.0f} KB')


def write_streets(name, features):
    write_json(name, {
        'type': 'FeatureCollection',
        'attribution': '(c) OpenStreetMap contributors, ODbL 1.0',
        'features': features,
    })
    print(f'  {len(features)} streets')


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--cache', help='directory for caching raw Overpass responses')
    args = ap.parse_args()

    streets = build_streets(overpass(STREETS_QUERY, args.cache, 'streets.json').get('elements', []))
    if not streets:
        sys.exit('No streets returned from Overpass - aborting.')
    write_streets('haugesund-streets-kommune.json', streets)
    write_streets('haugesund-streets-sentrum.json', sentrum_subset(streets))

    # Generous frame so the drawn land/sea fills the screen; the game limits panning to it.
    w, s, e, n = streets_bbox(streets, margin_lon=0.15, margin_lat=0.07)
    coast = overpass(COAST_QUERY.format(s=s, w=w, n=n, e=e), args.cache, 'coast_v2.json').get('elements', [])
    ctx = overpass(CONTEXT_QUERY, args.cache, 'context.json').get('elements', [])
    context = build_context(ctx, coast, (w, s, e, n), {f['properties']['name'] for f in streets})
    write_json('haugesund-context.json', context)
    for k in ('land', 'water', 'green', 'labels'):
        print(f'  {k}: {len(context[k])}')
    print(f'  buildings: {len(context["buildings"]["rings"])}')


if __name__ == '__main__':
    main()
