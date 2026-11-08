import json
import urllib.request
import urllib.error
import urllib.parse
import ssl
import time
import re
from concurrent.futures import ThreadPoolExecutor, as_completed

# Permissive SSL context for testing diverse station servers
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    'Icy-MetaData': '1',
    'Range': 'bytes=0-2048'
}

def normalize_name(name):
    if not name:
        return ""
    n = name.lower()
    for tr, en in [('ç', 'c'), ('ğ', 'g'), ('ı', 'i'), ('i', 'i'), ('ö', 'o'), ('ş', 's'), ('ü', 'u')]:
        n = n.replace(tr, en)
    n = re.sub(r'\b(radyo|radyosu|fm|turk|turkce|turkiye|canli|web|online)\b', '', n)
    n = re.sub(r'[^a-z0-9]', '', n)
    return n.strip()

print("1. Fetching alive Turkish stations from Radio Browser API...")
rb_map = {}
try:
    req = urllib.request.Request("https://de1.api.radio-browser.info/json/stations/bycountrycodeexact/TR", headers={'User-Agent': 'rAdioApp/2.0'})
    with urllib.request.urlopen(req, timeout=12, context=ctx) as resp:
        rb_data = json.load(resp)
        print(f"Loaded {len(rb_data)} stations from Radio Browser.")
        for item in rb_data:
            if item.get('lastcheckok') == 1 and item.get('url_resolved'):
                norm = normalize_name(item.get('name', ''))
                if norm and norm not in rb_map:
                    rb_map[norm] = item['url_resolved']
        print(f"Indexed {len(rb_map)} unique alive verified stations from Radio Browser.")
except Exception as e:
    print("Warning: Could not fetch Radio Browser API:", e)

print("\n2. Loading local stations from data/stations.json...")
with open('data/stations.json', 'r', encoding='utf-8') as f:
    stations = json.load(f)
print(f"Total local stations: {len(stations)}")

def test_url(url, timeout=3.5):
    if not url or not url.startswith('http'):
        return False, "INVALID_URL", None
    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
            code = resp.getcode()
            ctype = resp.headers.get('Content-Type', '').lower()
            if code in [200, 206]:
                # Reject HTML status pages returned by Shoutcast / Icecast error handlers
                if 'text/html' in ctype and 'audio' not in ctype and 'mpegurl' not in ctype:
                    return False, f"HTML_RETURNED ({ctype})", None
                return True, "OK", ctype
            return False, f"HTTP_{code}", ctype
    except urllib.error.HTTPError as e:
        return False, f"HTTP_{e.code}", None
    except urllib.error.URLError as e:
        return False, f"URL_ERR_{str(e.reason)[:30]}", None
    except TimeoutError:
        return False, "TIMEOUT", None
    except Exception as e:
        return False, f"ERR_{str(e)[:30]}", None

def audit_single_station(st):
    st_id = st['id']
    name = st['name']
    orig_url = st['url']

    # 1. Test original URL
    ok, reason, ctype = test_url(orig_url)
    if ok:
        return {
            "id": st_id,
            "status": "ORIGINAL_OK",
            "url": orig_url,
            "old_url": orig_url,
            "ctype": ctype
        }

    candidates_to_try = []

    # 2. Candidate: Shoutcast missing /;
    parsed = urllib.parse.urlparse(orig_url)
    if parsed.port and (not parsed.path or parsed.path == '/'):
        candidates_to_try.append(f"{parsed.scheme}://{parsed.hostname}:{parsed.port}/;")
        candidates_to_try.append(f"{parsed.scheme}://{parsed.hostname}:{parsed.port}/stream")

    # 3. Candidate: HTTPS upgrade
    if orig_url.startswith('http://'):
        candidates_to_try.append(orig_url.replace('http://', 'https://', 1))

    # 4. Candidate: Radio Browser matched alive stream
    norm = normalize_name(name)
    if norm in rb_map:
        candidates_to_try.append(rb_map[norm])

    # Test candidates in order
    for cand in candidates_to_try:
        cand_ok, cand_reason, cand_ctype = test_url(cand)
        if cand_ok:
            return {
                "id": st_id,
                "status": "FIXED_UPDATED",
                "url": cand,
                "old_url": orig_url,
                "ctype": cand_ctype
            }

    return {
        "id": st_id,
        "status": "DEAD_UNREACHABLE",
        "url": orig_url,
        "old_url": orig_url,
        "error": reason
    }

print("\n3. Auditing and fixing all 1,426 stations using multi-threading...")
start_time = time.time()
results_by_id = {}

with ThreadPoolExecutor(max_workers=40) as executor:
    futures = {executor.submit(audit_single_station, st): st for st in stations}
    done = 0
    total = len(stations)
    for fut in as_completed(futures):
        res = fut.result()
        results_by_id[res['id']] = res
        done += 1
        if done % 100 == 0 or done == total:
            elapsed = round(time.time() - start_time, 1)
            print(f"Progress: {done}/{total} ({round(done/total*100)}%) - Elapsed: {elapsed}s")

elapsed_total = round(time.time() - start_time, 1)
print(f"\nAudit completed in {elapsed_total} seconds.")

# Count breakdown
orig_ok = sum(1 for r in results_by_id.values() if r['status'] == 'ORIGINAL_OK')
fixed = sum(1 for r in results_by_id.values() if r['status'] == 'FIXED_UPDATED')
dead = sum(1 for r in results_by_id.values() if r['status'] == 'DEAD_UNREACHABLE')

print("\n--- AUDIT SUMMARY ---")
print(f"Total Stations: {len(stations)}")
print(f"Original Working: {orig_ok} ({round(orig_ok/len(stations)*100, 1)}%)")
print(f"Fixed with Working Stream: {fixed} ({round(fixed/len(stations)*100, 1)}%)")
print(f"Total Working After Fixes: {orig_ok + fixed} ({round((orig_ok+fixed)/len(stations)*100, 1)}%)")
print(f"Permanently Offline: {dead} ({round(dead/len(stations)*100, 1)}%)")

# Update data/stations.json
updated_count = 0
for st in stations:
    res = results_by_id.get(st['id'])
    if res and res['status'] == 'FIXED_UPDATED':
        st['url'] = res['url']
        st['isHttps'] = res['url'].startswith('https://')
        lower = res['url'].lower()
        if '.m3u8' in lower:
            st['format'] = 'hls'
        elif '.aac' in lower:
            st['format'] = 'aac'
        elif '.mp3' in lower:
            st['format'] = 'mp3'
        st['isVerifiedAlive'] = True
        updated_count += 1
    elif res and res['status'] == 'ORIGINAL_OK':
        st['isVerifiedAlive'] = True
    else:
        st['isVerifiedAlive'] = False

with open('data/stations.json', 'w', encoding='utf-8') as f:
    json.dump(stations, f, ensure_ascii=False, indent=2)

print(f"\nSaved updated data/stations.json with {updated_count} fixed station URLs!")
