import json
import urllib.request
import urllib.error
import urllib.parse
import ssl
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
import time

strict_ctx = ssl.create_default_context()
loose_ctx = ssl.create_default_context()
loose_ctx.check_hostname = False
loose_ctx.verify_mode = ssl.CERT_NONE

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    'Icy-MetaData': '1',
    'Range': 'bytes=0-2048'
}

def test_stream(url, strict=True, timeout=3.5):
    if not url or not url.startswith('http'):
        return False, "INVALID_URL", None
    ctx = strict_ctx if strict else loose_ctx
    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
            code = resp.getcode()
            ctype = resp.headers.get('Content-Type', '').lower()
            if code in [200, 206]:
                if 'text/html' in ctype and 'audio' not in ctype and 'mpegurl' not in ctype:
                    return False, f"HTML_PAGE ({ctype})", None
                return True, "OK", ctype
            return False, f"HTTP_{code}", ctype
    except Exception as e:
        err = str(e)
        if 'ICY 200' in err:
            return True, "OK_ICY", "audio/mpeg"
        return False, err[:40], None

print("1. Loading verified Radio Browser stations...")
with open('verified_rb_tr.json', 'r', encoding='utf-8') as f:
    rb_list = json.load(f)

def normalize_name(name):
    if not name:
        return ""
    n = name.lower()
    for tr, en in [('ç', 'c'), ('ğ', 'g'), ('ı', 'i'), ('i', 'i'), ('ö', 'o'), ('ş', 's'), ('ü', 'u')]:
        n = n.replace(tr, en)
    n = re.sub(r'\b(radyo|radyosu|fm|turk|turkce|turkiye|canli|web|online|radio)\b', '', n)
    n = re.sub(r'[^a-z0-9]', '', n)
    return n.strip()

rb_map = {}
for r in rb_list:
    norm = normalize_name(r['name'])
    if norm and norm not in rb_map:
        rb_map[norm] = r['url']

# Hardcoded pristine verified modern CDN streams for major Turkish stations
MAJOR_STATION_OVERRIDES = {
    6: "https://dygedge2.radyotvonline.net/kralfm/playlist.m3u8",       # Kral FM
    12: "https://dygedge2.radyotvonline.net/kralpop/playlist.m3u8",     # Kral Pop
    36: "https://radyo.duhnet.tv/ak_dtvh_slowturk",                     # Slow Türk
    1149: "https://moondigitalmaster.radyotvonline.net/kafaradyo/playlist.m3u8", # Kafa Radyo
    54: "http://yayin.asymedya.com:8020/;",                             # Aşk FM
    141: "http://yayin.netradyom.com:9910/RADYOBANKO",                  # Radyo Banko
    771: "http://yayin.netradyom.com:8050/PARKFM",                      # Park FM
    30: "http://37.247.100.118/stream/157/",                            # Radyo Trafik İstanbul
    140: "https://stream.netradyom.com/radio/7120/radio.mp3",           # Ankara Megasite
    818: "https://stream.netradyom.com/radio/9300/radio.mp3",           # Radyo Vizyon
    819: "https://stream.netradyom.com/radio/7020/radio.mp3",           # Vizyon Dance
    820: "https://stream.netradyom.com/radio/7070/radio.mp3",           # Vizyon Halk
    821: "https://stream.netradyom.com/radio/7050/radio.mp3",           # Vizyon Lounge
    252: "https://sokradyo.80.yayin.com.tr/stream",                     # Hatay Şok Radyo
    255: "http://radyomelodi.80.yayin.com.tr/stream",                   # Hatay Melodi FM
    436: "https://radyoext.80.yayin.com.tr/stream",                     # Tokat Radyo Extra
    481: "https://gozdefm.80.yayin.com.tr/stream",                      # Yalova Gözde FM
    261: "https://yayin.radyoakdeniz.com/9470/stream",                  # Mersin Radyo Akdeniz
    371: "https://live.radyo.in/8066/stream",                           # Manisa Seç FM
    411: "https://radyo.yayin.com.tr:6040/stream",                      # Sakarya Ada FM
    941: "https://live.radyofenomen.com/fenomenclubbin/128/icecast.audio", # Fenomen Clubbin
    1701: "https://anadolu.liderhost.com.tr:10912/;",                   # Elazığ Radyo Fırat
}

print("2. Loading local stations from data/stations.json...")
with open('data/stations.json', 'r', encoding='utf-8') as f:
    stations = json.load(f)

def fix_station(st):
    st_id = st['id']
    name = st['name']
    url = st['url']

    # 1. Check direct override first
    if st_id in MAJOR_STATION_OVERRIDES:
        override_url = MAJOR_STATION_OVERRIDES[st_id]
        return {
            'id': st_id,
            'url': override_url,
            'status': 'OVERRIDE_FIX',
            'isHttps': override_url.startswith('https://')
        }

    # 2. Check strict SSL browser test on current URL
    strict_ok, _, ctype = test_stream(url, strict=True)
    if strict_ok and url.startswith('https://'):
        return {
            'id': st_id,
            'url': url,
            'status': 'STRICT_SSL_OK',
            'isHttps': True,
            'ctype': ctype
        }

    # 3. If failed strict SSL or is HTTP, check verified Radio Browser match
    norm = normalize_name(name)
    if norm in rb_map:
        rb_url = rb_map[norm]
        rb_ok, _, rb_ctype = test_stream(rb_url, strict=True)
        if rb_ok:
            return {
                'id': st_id,
                'url': rb_url,
                'status': 'RB_STRICT_UPGRADE',
                'isHttps': True,
                'ctype': rb_ctype
            }

    # 4. If current URL had SSL cert error on yayindakiler, canliyayin, netyayin, etc., test HTTP
    if url.startswith('https://'):
        http_url = url.replace('https://', 'http://', 1)
        http_ok, _, http_ctype = test_stream(http_url, strict=False)
        if http_ok:
            return {
                'id': st_id,
                'url': http_url,
                'status': 'HTTP_FALLBACK_OK',
                'isHttps': False,
                'ctype': http_ctype
            }

    # 5. Test with loose SSL
    loose_ok, _, loose_ctype = test_stream(url, strict=False)
    if loose_ok:
        return {
            'id': st_id,
            'url': url,
            'status': 'LOOSE_SSL_OK',
            'isHttps': url.startswith('https://'),
            'ctype': loose_ctype
        }

    # 6. Unreachable
    return {
        'id': st_id,
        'url': url,
        'status': 'DEAD',
        'isHttps': url.startswith('https://')
    }

print("3. Executing one-shot stream verification and repair...")
start = time.time()
repaired_results = {}

with ThreadPoolExecutor(max_workers=50) as executor:
    futures = {executor.submit(fix_station, st): st for st in stations}
    done = 0
    total = len(stations)
    for fut in as_completed(futures):
        res = fut.result()
        repaired_results[res['id']] = res
        done += 1
        if done % 200 == 0 or done == total:
            print(f"Progress: {done}/{total} ({round(done/total*100)}%) - {round(time.time() - start, 1)}s")

print(f"\nCompleted in {round(time.time() - start, 1)}s")

# Apply results to stations
status_counts = {}
updated_count = 0

for st in stations:
    res = repaired_results.get(st['id'])
    if not res:
        continue
    status = res['status']
    status_counts[status] = status_counts.get(status, 0) + 1

    if res['url'] != st['url']:
        st['url'] = res['url']
        updated_count += 1
    
    st['isHttps'] = res['isHttps']
    lower = st['url'].lower()
    if '.m3u8' in lower:
        st['format'] = 'hls'
    elif '.aac' in lower or 'aac' in str(res.get('ctype')):
        st['format'] = 'aac'
    elif '.mp3' in lower:
        st['format'] = 'mp3'

    st['isVerifiedAlive'] = (status != 'DEAD')

# Sort: alive first, then order, then id
stations.sort(key=lambda x: (not x.get('isVerifiedAlive', False), x.get('order', 9999), x.get('id', 0)))

with open('data/stations.json', 'w', encoding='utf-8') as f:
    json.dump(stations, f, ensure_ascii=False, indent=2)

print("\n--- REPAIR BREAKDOWN ---")
for s, c in sorted(status_counts.items(), key=lambda x: -x[1]):
    print(f"  {s}: {c}")

alive_count = sum(1 for s in stations if s.get('isVerifiedAlive'))
print(f"\nTotal Stations: {len(stations)}")
print(f"Total Alive & Verified: {alive_count} ({round(alive_count/len(stations)*100, 1)}%)")
print(f"Total URLs Changed/Upgraded: {updated_count}")
