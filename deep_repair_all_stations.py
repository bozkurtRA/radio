import json
import urllib.request
import urllib.error
import urllib.parse
import http.client
import ssl
import time
import re
from concurrent.futures import ThreadPoolExecutor, as_completed

# Permissive SSL context
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
    n = re.sub(r'\b(radyo|radyosu|fm|turk|turkce|turkiye|canli|web|online|radio)\b', '', n)
    n = re.sub(r'[^a-z0-9]', '', n)
    return n.strip()

print("1. Fetching alive Turkish stations from Radio Browser API...")
rb_map = {}
rb_word_map = []
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
                
                # Also store word set for matching
                words = re.findall(r'[a-z0-9]{3,}', norm)
                if words:
                    rb_word_map.append((set(words), item['name'], item['url_resolved']))
        print(f"Indexed {len(rb_map)} normalized and {len(rb_word_map)} word-indexed alive stations.")
except Exception as e:
    print("Warning: Could not fetch Radio Browser API:", e)

def test_url(url, timeout=3.5):
    if not url or not url.startswith('http'):
        return False, "INVALID_URL", None
    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
            code = resp.getcode()
            ctype = resp.headers.get('Content-Type', '').lower()
            if code in [200, 206]:
                # Reject HTML status pages
                if 'text/html' in ctype and 'audio' not in ctype and 'mpegurl' not in ctype:
                    return False, f"HTML_PAGE ({ctype})", None
                return True, "OK", ctype
            return False, f"HTTP_{code}", ctype
    except http.client.BadStatusLine as e:
        # Shoutcast often responds with 'ICY 200 OK' which Python treats as BadStatusLine
        line = str(e.line) if hasattr(e, 'line') else str(e)
        if 'ICY 200' in line or '200' in line:
            return True, "OK_ICY", "audio/mpeg"
        return False, f"BAD_STATUS_{line[:20]}", None
    except urllib.error.HTTPError as e:
        return False, f"HTTP_{e.code}", None
    except urllib.error.URLError as e:
        return False, f"URL_ERR_{str(e.reason)[:30]}", None
    except Exception as e:
        err_str = str(e)
        if 'ICY 200' in err_str:
            return True, "OK_ICY", "audio/mpeg"
        return False, f"ERR_{err_str[:30]}", None

def get_candidates(name, orig_url):
    candidates = []
    parsed = urllib.parse.urlparse(orig_url)

    # A. Netradyom / Azuracast pattern
    if 'stream.netradyom.com' in orig_url:
        m = re.search(r'stream\.netradyom\.com/(?:listen|radio)/([^/?]+)', orig_url)
        if m:
            slug = m.group(1)
            candidates.append(f"https://stream.netradyom.com/radio/{slug}/radio.mp3")
            candidates.append(f"https://stream.netradyom.com/listen/{slug}/radio.mp3")
            candidates.append(f"http://stream.netradyom.com/radio/{slug}/radio.mp3")

    # B. yayin.com.tr / 80.yayin.com.tr
    if '80.yayin.com.tr' in orig_url:
        candidates.append(orig_url.rstrip('/') + '/stream')
        candidates.append(orig_url.rstrip('/') + '/;')
        if orig_url.startswith('https://'):
            candidates.append(orig_url.replace('https://', 'http://', 1).rstrip('/') + '/stream')
            candidates.append(orig_url.replace('https://', 'http://', 1).rstrip('/') + '/;')

    # C. Shoutcast port /; and /stream
    if parsed.port:
        base_http = f"http://{parsed.hostname}:{parsed.port}"
        base_https = f"https://{parsed.hostname}:{parsed.port}"
        for b in [base_http, base_https]:
            candidates.append(f"{b}/;")
            candidates.append(f"{b}/stream")
            candidates.append(f"{b}/")

    # D. Protocol swap (HTTP <-> HTTPS)
    if orig_url.startswith('https://'):
        candidates.append(orig_url.replace('https://', 'http://', 1))
    elif orig_url.startswith('http://'):
        candidates.append(orig_url.replace('http://', 'https://', 1))

    # E. Radio Browser normalized exact match
    norm = normalize_name(name)
    if norm in rb_map:
        candidates.append(rb_map[norm])

    # F. Radio Browser word overlap match for distinct names
    words = set(re.findall(r'[a-z0-9]{3,}', norm))
    if len(words) >= 1:
        for rb_words, rb_name, rb_url in rb_word_map:
            if words == rb_words:
                candidates.append(rb_url)

    # Deduplicate while preserving order, remove original
    seen = {orig_url}
    clean_candidates = []
    for c in candidates:
        if c and c not in seen:
            seen.add(c)
            clean_candidates.append(c)
    return clean_candidates

print("\n2. Loading local stations from data/stations.json...")
with open('data/stations.json', 'r', encoding='utf-8') as f:
    stations = json.load(f)
print(f"Total local stations: {len(stations)}")

def audit_station(st):
    st_id = st['id']
    name = st['name']
    orig_url = st['url']

    # Test original URL first
    ok, reason, ctype = test_url(orig_url)
    if ok:
        return {
            "id": st_id,
            "status": "ORIGINAL_OK",
            "url": orig_url,
            "ctype": ctype
        }

    # If original fails, test candidate repairs
    candidates = get_candidates(name, orig_url)
    for cand in candidates:
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
        "error": reason
    }

print("\n3. Running comprehensive audit & repair across all stations...")
start_time = time.time()
results_by_id = {}

with ThreadPoolExecutor(max_workers=50) as executor:
    futures = {executor.submit(audit_station, st): st for st in stations}
    done = 0
    total = len(stations)
    for fut in as_completed(futures):
        res = fut.result()
        results_by_id[res['id']] = res
        done += 1
        if done % 150 == 0 or done == total:
            elapsed = round(time.time() - start_time, 1)
            print(f"Progress: {done}/{total} ({round(done/total*100)}%) - {elapsed}s")

elapsed_total = round(time.time() - start_time, 1)
print(f"\nAudit completed in {elapsed_total} seconds.")

orig_ok = sum(1 for r in results_by_id.values() if r['status'] == 'ORIGINAL_OK')
fixed = sum(1 for r in results_by_id.values() if r['status'] == 'FIXED_UPDATED')
dead = sum(1 for r in results_by_id.values() if r['status'] == 'DEAD_UNREACHABLE')

print("\n--- FINAL COMPREHENSIVE REPAIR RESULTS ---")
print(f"Total Stations: {len(stations)}")
print(f"Original Working: {orig_ok} ({round(orig_ok/len(stations)*100, 1)}%)")
print(f"Fixed & Replaced with Working Streams: {fixed} ({round(fixed/len(stations)*100, 1)}%)")
print(f"Total Working Stations: {orig_ok + fixed} ({round((orig_ok+fixed)/len(stations)*100, 1)}%)")
print(f"Permanently Inactive: {dead} ({round(dead/len(stations)*100, 1)}%)")

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
        elif '.aac' in lower or 'aacp' in str(res.get('ctype')):
            st['format'] = 'aac'
        elif '.mp3' in lower:
            st['format'] = 'mp3'
        st['isVerifiedAlive'] = True
        updated_count += 1
    elif res and res['status'] == 'ORIGINAL_OK':
        st['isVerifiedAlive'] = True
    else:
        st['isVerifiedAlive'] = False

# Sort stations so that verified alive stations appear first, keeping original order within each group
stations.sort(key=lambda x: (not x.get('isVerifiedAlive', False), x.get('order', 9999), x.get('id', 0)))

with open('data/stations.json', 'w', encoding='utf-8') as f:
    json.dump(stations, f, ensure_ascii=False, indent=2)

print(f"\nSuccessfully wrote {len(stations)} stations to data/stations.json with {updated_count} repaired streams!")
