#!/usr/bin/env python3
"""Build content/programs.json, the Workforce Navigator's program catalog.

Every program the Navigator's organizations list, in one shape:
    name, org, earn, credential, length, bucket, field, cost, campus, url, options, online, verify, source

Sources (see tools/README.md for how to refresh):
  - Middle Georgia State: its live degree table, https://www.mga.edu/degrees/index.php
  - Mercer: its live program API (the one its own Program Finder uses), Macon and online programs only
  - Central Georgia Tech: tools/sources/cgtc-programs.txt, transcribed from its official Programs of Study PDF
  - Everyone else: tools/sources/manual-programs.json, checked by hand

Run from the repo root:  python3 tools/build-programs.py
"""
import datetime
import html
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCES = os.path.join(ROOT, 'tools', 'sources')
OUT = os.path.join(ROOT, 'content', 'programs.json')
TODAY = datetime.date.today().isoformat()
UA = {'User-Agent': 'Mozilla/5.0 (Workforce Macon catalog builder)'}


def fetch(url, tries=3):
    for attempt in range(tries):   # school sites occasionally drop a connection; try again before giving up
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
                return r.read().decode('utf-8', 'ignore')
        except Exception:
            if attempt == tries - 1:
                raise
            time.sleep(2 * (attempt + 1))


def slug(s):
    return re.sub(r'[^a-z0-9]+', '-', s.lower().replace('&', 'and')).strip('-')


# ----- Fields: one list for every school, matched from the program's own name (first match wins) -----
FIELDS = [
    ('aviation',      r'aviat|aircraft|\bflight|air traffic|airframe|powerplant'),
    ('healthcare',    r'nurs|medic|health|pharm|dental|phleb|electrocardio|radiolog|surgical|echocard|cardio|imaging|tomograph|magnetic resonance|'
                      r'hemodial|polysom|\bems\b|paramedic|emergency medical|orthopedic|physical therap|occupational therap|respiratory|'
                      r'laboratory|biotech|rehabilitation|coding|personal trainer|nurse aide|patient'),
    ('it',            r'cyber|network|comput|programm|software|\bweb|cloud|comptia|help desk|information tech|\bdata\b|data science|'
                      r'artificial intelligence|\bai\b|java|linux|cisco|\baws\b|generative|game design|informatics|fintech|financial technology'),
    ('logistics',     r'\blogist|supply chain|warehous|inventory|purchasing|commercial driving|distribution|transportation'),
    ('manufacturing', r'mechatron|automation|robot|machin|\bcnc\b|lathe|mill operator|metrolog|calibration|instrument|industrial|engineer|'
                      r'electronic|drafter|fluid power|motor control|programmable|manufactur|mechanic|maintenance'),
    ('trades',        r'weld|carpent|construct|electric|wiring|hvac|air condition|plumb|automotive|diesel|collision|vehicle|arc welder'),
    ('publicsafety',  r'criminal|justice|law enforcement|firefight|\bfire\b|emergency management|homeland|public safety|crime|disaster'),
    ('education',     r'educat|teach|early childhood|child care|infant|curriculum|literacy|paraprof|endorsement'),
    ('hospitality',   r'hotel|restaurant|touris|hospitality|culinar|baking|chef'),
    ('personal',      r'barber|cosmetolog|salon'),
    ('business',      r'account|business|financ|bank|market|manag|entrepreneur|payroll|\btax|office|administrat|human resource|econom|retail|'
                      r'leadership|selling|audit|sport'),
    ('media',         r'\bart\b|\barts\b|design|media|film|music|theat|graphic|video|motion graphics|communication|journalism|writing|advertis|'
                      r'public relations|broadcast|animation|photograph'),
    ('science',       r'biolog|chemi|physics|math|environment|neurosci|statistic|science'),
    ('social',        r'psych|social work|sociolog|history|politic|\blaw\b|legal|philosoph|religio|theolog|english|language|spanish|french|'
                      r'anthropolog|human services|counsel|public admin|divinity|ministry|criminology|african|asian|global|women'),
    ('general',       r'core curriculum|general studies|interdisciplinary|liberal|technical studies|technical specialist|studies'),
]


# Names that the general rules would misfile
OVERRIDES = [
    ('general',    r'core curriculum'),
    ('education',  r'b\.s\.ed|\bm\.ed\b|\bed\.s\b|\bm\.a\.t\b|school leadership|instructional design'),
    ('media',      r'esports|streaming|broadcast'),
    ('it',         r'database|information design'),
    ('manufacturing', r'robotic manufacturing|programmable control|biomedical engineering'),
    ('trades',     r'residential/industrial wiring'),
    ('social',     r'mental health and human services|philosophy, politics'),
    ('personal',   r'barber|cosmetolog'),
    ('business',   r'accounting|microsoft (excel|word|office)|\bm\.?b\.?a\b'),
    ('social',     r'political science|juris|family therapy|international affairs|behavior analysis|victim|latin|classic|humanities'),
    ('it',         r'information science'),
    ('healthcare', r'kinesiolog|athletic training'),
    ('aviation',   r'unmanned|aerial'),
    ('trades',     r'automotive|diesel'),
    ('education',  r'early learning'),
    ('media',      r'piano|conducting|performance|\bm\.m\.'),
]


def field_of(name):
    # "Associate of Science in Psychology" is about psychology, not science
    n = re.sub(r'^(associate of (applied )?science in|aas in|associate of science in)\s+', '', name.lower())
    for field, pattern in OVERRIDES:
        if re.search(pattern, n):
            return field
    for field, pattern in FIELDS:
        if re.search(pattern, n):
            return field
    return 'general'


# ----- Length buckets: weeks (under 3 months) · months (3–12) · 1to2 (1–2 years) · 3plus -----
def cgtc_length(earn, name):
    if earn == 'associate':
        return 'About 2 years full time', '1to2'
    if earn == 'diploma':
        return 'About 18 months full time', '1to2'
    if re.search(r'accelerated|fast track|commercial driving|construction career launch', name, re.I):
        return 'Accelerated: usually under 3 months', 'weeks'
    return 'Under a year full time', 'months'


CGTC_DIVISIONS = {
    'Aerospace, Trade and Industry': 'aerospace-trade-industry',
    'Business and Computer Technologies': 'business-computer-technologies',
    'General Studies': 'general-studies',
    'Health Sciences': 'health-sciences',
    'Public Safety and Professional Services': 'public-safety-professional-services',
}
CGTC_CREDENTIAL = {'associate': 'Associate degree', 'diploma': 'Technical diploma', 'certificate': 'Technical Certificate of Credit'}
CGTC_COST = {k: '$107 per credit hour' for k in ('associate', 'diploma', 'certificate')}   # TCSG tuition, 2025–26
CGTC_SOURCE = 'https://www.centralgatech.edu/wp-content/uploads/pdfs/academics/ProgramsOfStudy.pdf'


# ----- Where each CGTC program runs, and its credit hours, from its catalog (tools/parse-cgtc-catalog.py) -----
CGTC_TUITION = 107   # per credit hour, 2025–26
CGTC_SITE_PLACE = {   # catalog site -> the town it's in, for the Navigator's map
    'Macon': 'macon', 'ATC/Middle GA Regional Airport': 'macon', 'Warner Robins': 'warner-robins', 'VECTR': 'warner-robins',
    'Milledgeville': 'milledgeville', 'Putnam': 'eatonton', 'Peach': 'fort-valley', 'Hawkinsville': 'hawkinsville',
}
TOWN = {'macon': 'Macon', 'warner-robins': 'Warner Robins', 'milledgeville': 'Milledgeville', 'eatonton': 'Eatonton',
        'fort-valley': 'Fort Valley', 'hawkinsville': 'Hawkinsville'}
# Programs whose catalog entry is named differently, matched by program code
CGTC_CODES = {
    'Applied Technical Management': 'AS33', 'AAS in Allied Health Professions': 'AFA3',
    'Associate of Science in General Studies with Healthcare Professional Pathway': 'AB73', 'Electrical Controls Systems': 'EC22',
    'AI Enhanced Robotic Manufacturing Specialist': 'AE81', 'Automotive Electrical/Electronic Systems Technician': 'AE41',
    'Automotive Transmission/Transaxle Technician Specialist': 'AA71', 'Aviation Maintenance Technician - Powerplant': 'AM61',
    'Commercial Electrical Construction Technician': 'CEC1', 'Diesel Electrical/Electronic Systems Technician': 'DE11',
    'Electric Vehicle Professional': 'EVP1', 'Hybrid/Electric Vehicle Repair Technician': 'HVR1',
    'Vertical Shielded Metal Arc Welding Fabricator': 'VSM1', 'Certified Warehousing & Distribution Specialist': 'CW11',
    'Healthcare Billing and Reimbursement Assistant': 'HBA1', 'Web Site Designer': 'IS41', 'Web Site Developer': 'ISE1',
    'Certified Tomography Specialist': 'CT91', 'Military Medic Personnel to LPN Transition Program': 'ME91',
}
# Entries the parser can't read cleanly, taken from the catalog by hand
CGTC_MANUAL = {'Commercial Driving - Class B': {'sites': ['Peach'], 'hours': 9},
               'Associate of Science in Nursing (ASN) Bridge': {'sites': ['Macon'], 'hours': 62},
               'Cardiovascular Technology': {'sites': ['Macon'], 'hours': 70},
               'Emergency Medical Technician (EMT)': {'sites': ['Macon'], 'hours': None}}


def cgtc_catalog():
    path = os.path.join(SOURCES, 'cgtc-catalog.json')
    if not os.path.exists(path):
        return {}, {}
    rows = json.load(open(path, encoding='utf-8'))['programs']
    award = lambda a: 'certificate' if 'Certificate' in a else 'diploma' if a == 'Diploma' else 'associate'
    by_name, by_code = {}, {}
    for r in rows:
        by_name.setdefault((cgtc_key(r['name']), award(r['award'])), r)
        by_code.setdefault(r['code'], r)
    return by_name, by_code


def cgtc_key(name):
    s = name.lower().replace('&', 'and').replace('–', '-')
    s = re.sub(r'\bnccer\b|\(.*?\)|\btechnology\b|\btechnician\b|\bspecialist\b|\bprofessional\b|\bdegree\b|\bdiploma\b|'
               r'\bcertificate\b|\bprep(aration)?\b|[^a-z0-9 ]', ' ', s)
    return ' '.join(s.split())


def cgtc_length_from_hours(hours, name):
    semesters = max(1, -(-hours // 15))   # full time is 12–15 credit hours a semester
    if re.search(r'accelerated|fast track|commercial driving|construction career launch', name, re.I):
        return f'Accelerated: usually under 3 months ({hours} credit hours)', 'weeks'
    text = f"About {semesters} semester{'s' if semesters > 1 else ''} full time ({hours} credit hours)"
    return text, 'months' if semesters <= 2 else '1to2' if semesters <= 6 else '3plus'


# ----- Each CGTC program's own live page (the inclusion rule: listed on an active web page) -----
CGTC_PAGE_STOP = {'technician', 'technology', 'technologies', 'specialist', 'certificate', 'technical', 'associate', 'degree', 'diploma',
                  'of', 'in', 'the', 'and', 'with', 'science', 'program', 'aas', 'professional', 'professionals', 'i', 'ii'}
CGTC_PAGE_ALIAS = {'information technology professional': 'it professional', 'commercial driving': 'commercial truck driving',
                   'website': 'web site', 'powerplant': 'power plant', 'associate of science in': 'as in'}


CGTC_PAGES = os.path.join(SOURCES, 'cgtc-pages.json')


def cgtc_pages():
    """Every program page linked from CGTC's five division pages (plus the division pages, which list some
    programs themselves), as each page's main content only (the sidebar lists every program on every page).
    Fetched politely; saved to tools/sources/cgtc-pages.json, which is used instead if the site is down."""
    divisions = ['aerospace-trade-industry', 'business-computer-technologies', 'general-studies', 'health-sciences',
                 'public-safety-professional-services']
    def main_text(page):
        body = re.sub(r'<script.*?</script>|<style.*?</style>|<nav.*?</nav>|<footer.*?</footer>|<header.*?</header>', ' ', page, flags=re.S)
        text = ' '.join(html.unescape(re.sub(r'<[^>]+>', ' ', body)).split())
        i = text.find('Home » Programs of Study »')
        text = text[i:] if i >= 0 else text
        j = text.find('Programs of Study Aerospace, Trade & Industry', 50)
        return text[:j] if j > 0 else text
    try:
        pages = {}
        for d in divisions:
            base = f'https://www.centralgatech.edu/programs-of-study/{d}'
            page = fetch(base + '/')
            pages[base] = main_text(page)
            for u in sorted({h.rstrip('/') for h in re.findall(r'href="(' + re.escape(base) + r'/[^"#?]+)"', page)}):
                if u not in pages:
                    time.sleep(0.5)
                    pages[u] = main_text(fetch(u))
        json.dump({'fetched': TODAY, 'pages': pages}, open(CGTC_PAGES, 'w'), indent=0, ensure_ascii=False)
        return pages
    except Exception as err:
        saved = json.load(open(CGTC_PAGES, encoding='utf-8'))
        print(f"  Central Georgia Tech's site isn't responding ({err}); using its pages saved {saved['fetched']}")
        return saved['pages']


def cgtc_words(s):
    s = s.lower().replace('&', 'and').replace('+', '').replace('.', '')
    for a, b in CGTC_PAGE_ALIAS.items():
        s = s.replace(a, b)
    return re.sub(r'[^a-z0-9 ]', ' ', s).split()


CGTC_PAGE_OVERRIDE = {'AAS in Allied Health Professions': 'health-sciences/nursing'}   # named differently on its page


def cgtc_page_for(name, pages, earn=''):
    """The program's page: one that names it outright, or one where all its key words appear within a
    dozen words of each other ("Commercial Truck Driving – Class A" for "Commercial Driving - Class A").
    Among pages that mention it, its own page wins (the address shares its words), then for certificates
    the certificate listing pages, then program pages before division pages, then the shorter page."""
    if name in CGTC_PAGE_OVERRIDE:
        return next((u for u in pages if u.endswith(CGTC_PAGE_OVERRIDE[name])), None)
    want = ' '.join(cgtc_words(name))
    key = {w[:6] for w in cgtc_words(name) if w not in CGTC_PAGE_STOP}
    hits = [u for u, t in pages.items() if want in ' '.join(cgtc_words(t))]
    if not hits and key:
        for u, t in pages.items():
            words = [w[:6] for w in cgtc_words(t)]
            if any(w in key and key <= set(words[i:i + 12]) for i, w in enumerate(words)):
                hits.append(u)
    if not hits:
        return None
    def rank(u):
        slug = u.rstrip('/').rsplit('/', 1)[-1]
        own = len(key & {w[:6] for w in slug.split('-')})
        division = u.rstrip('/').endswith(tuple(CGTC_DIVISIONS.values()))
        tcc = earn == 'certificate' and 'tccs' in slug
        return (-own, not tcc, division, len(pages[u]))
    return min(hits, key=rank)


def cgtc_programs():
    by_name, by_code = cgtc_catalog()
    pages = cgtc_pages()
    dropped = []
    out, earn, division, current = [], None, None, None
    for raw in open(os.path.join(SOURCES, 'cgtc-programs.txt'), encoding='utf-8'):
        line = raw.rstrip('\n')
        if not line.strip() or line.startswith('#'):
            continue
        if line.startswith('== '):
            earn, division = [x.strip() for x in line[3:].split('|')]
            continue
        if line.startswith('  '):   # an option (specialization) of the program above
            current['options'].append(line.strip().replace(' Specialization', ''))
            continue
        online = line.endswith('+')
        name = line.rstrip('+').strip()
        page = cgtc_page_for(name, pages, earn)
        if not page:
            dropped.append(f'{earn}: {name}')
            current = {'options': []}   # options below it have nowhere to go
            continue
        length, bucket = cgtc_length(earn, name)
        cat = CGTC_MANUAL.get(name) or by_name.get((cgtc_key(name), earn)) or by_code.get(CGTC_CODES.get(name, ''))
        cost, campus, places = CGTC_COST[earn], 'Macon, Warner Robins or other CGTC campuses', []
        if cat:
            public = [x for x in cat['sites'] if x in CGTC_SITE_PLACE]
            if public:
                places = list(dict.fromkeys(CGTC_SITE_PLACE[x] for x in public))
                campus = ' · '.join(TOWN[p] for p in places)   # one entry per town
            online = online or 'Online' in cat['sites']
            if cat.get('hours'):
                length, bucket = cgtc_length_from_hours(cat['hours'], name)
                cost = f"About ${cat['hours'] * CGTC_TUITION:,} tuition (${CGTC_TUITION} per credit hour)"
        current = {
            'org': 'central-ga-tech', 'name': name, 'earn': earn, 'credential': CGTC_CREDENTIAL[earn],
            'length': length, 'bucket': bucket, 'field': field_of(name), 'cost': cost,
            'campus': campus + (' · also online' if online else ''), 'places': places,
            'url': page, 'options': [], 'online': online, 'source': CGTC_SOURCE,
        }
        out.append(current)
    if dropped:
        print(f'  Central Georgia Tech: left out {len(dropped)} with no live program page: ' + '; '.join(dropped))
    return out


# ----- Middle Georgia State -----
MGA_URL = 'https://www.mga.edu/degrees/index.php'
MGA_PLACE = {'Macon': 'macon', 'Warner Robins': 'warner-robins', 'Cochran': 'cochran', 'Hybrid Cochran': 'cochran',
             'Dublin': 'dublin', 'Eastman': 'eastman', 'Trilith Studio': 'fayetteville'}


def mga_earn(deg):
    d = deg.replace(' ', '')
    if d in ('Minor', 'Transfer'):
        return None
    if d == 'Cert':
        return 'certificate'
    if d.startswith('A.'):
        return 'associate'
    if d.startswith('B.'):
        return 'bachelor'
    if 'Cert' in d:
        return 'gradcert'   # graduate, post-bachelor's and post-master's certificates
    return 'graduate'   # master's and doctoral degrees


def mga_length(earn, deg, name):
    n = name.lower()
    if earn == 'associate':
        return 'About 2 years full time', '1to2'
    if earn == 'certificate':
        return 'Usually under a year', 'months'
    if earn == 'bachelor':
        if 'completion' in n or 'bridge' in n or 'rn to bsn' in n:
            return 'About 1–2 years for those already licensed', '1to2'
        if 'accelerated' in n:
            return 'About 12–16 months for those with a bachelor\'s degree', '1to2'
        return 'About 4 years full time', '3plus'
    if earn == 'gradcert':
        return 'Usually under a year', 'months'
    if deg.startswith('D'):
        return '3 years or more', '3plus'
    return 'About 1–2 years', '1to2'


def mga_programs():
    s = fetch(MGA_URL)
    strip = lambda x: ' '.join(html.unescape(re.sub(r'<[^>]+>', ' ', re.sub(r'<script.*?</script>', '', x, flags=re.S))).split())
    parents = []
    for th, rest in re.findall(r'<tr>\s*<th scope="row">(.*?)</th>(.*?)</tr>', s, re.S):
        tds = re.findall(r'<td>(.*?)</td>', rest, re.S)
        if len(tds) < 5:
            continue
        link = re.search(r'href="([^"]+)"', th)
        row = {'name': strip(th), 'deg': strip(tds[0]),
               'campuses': re.findall(r'<b>(.*?)</b>', re.sub(r'<script.*?</script>', '', tds[3], flags=re.S))}
        if 'track-name' in th and parents:
            parents[-1]['tracks'].append(row)
        else:
            row['url'] = link.group(1) if link else None
            row['tracks'] = []
            parents.append(row)
    out = []
    for p in parents:
        url = urllib.parse.urljoin(MGA_URL, p['url']) if p['url'] else MGA_URL
        for t in (p['tracks'] or [p]):
            name = f"{p['name']}: {t['name']}" if p['tracks'] else p['name']
            deg = t['deg'] or p['deg']
            earn = mga_earn(deg)
            if not earn or 'honors' in name.lower():   # the Honors Pathway is a program within a degree, not a credential
                continue
            campuses = t['campuses'] or p['campuses']
            length, bucket = mga_length(earn, deg, name)
            out.append({
                'org': 'middle-ga-state', 'name': name, 'earn': earn, 'credential': deg, 'length': length, 'bucket': bucket,
                'field': field_of(name), 'cost': 'Public university tuition',
                'campus': ', '.join(campuses) if campuses else 'See the program page',
                'places': list(dict.fromkeys(MGA_PLACE[c] for c in campuses if c in MGA_PLACE)),
                'url': url, 'options': [], 'online': 'Online' in campuses, 'source': MGA_URL,
            })
    # Same name, different degree (Core Curriculum is both an A.A. and an A.S.): name the degree
    names = {}
    for p in out:
        names.setdefault((p['name'], p['earn']), set()).add(p['credential'])
    for p in out:
        if len(names[(p['name'], p['earn'])]) > 1:
            p['name'] = f"{p['name']} ({p['credential']})"
    # The same program can be listed twice (e.g. a certificate under two headings)
    seen, unique = set(), []
    for p in out:
        key = (p['name'], p['credential'])
        if key not in seen:
            seen.add(key)
            unique.append(p)
    return unique


# ----- Mercer -----
MERCER_API = 'https://wp.mercer.edu/wp-json/wp/v2/programs?per_page=100&order=asc&orderby=title&page={}'
MERCER_MACON, MERCER_ONLINE = 7, 72


def mercer_earn(level):
    l = level.lower()
    if 'bachelor' in l:
        return 'bachelor'
    if 'undergraduate' in l:
        return 'certificate'
    if 'graduate certificate' in l or 'non-degree, graduate' in l:
        return 'gradcert'   # graduate certificates and teacher endorsements
    return 'graduate'


def mercer_programs():
    rows, page = [], 1
    while True:
        try:
            batch = json.loads(fetch(MERCER_API.format(page)))
        except Exception:
            break
        if not isinstance(batch, list) or not batch:
            break
        rows += batch
        page += 1
    merged = {}
    for x in rows:
        locs = set(x.get('location') or [])
        if not locs & {MERCER_MACON, MERCER_ONLINE}:
            continue
        t = x.get('program_tax') or {}
        track = t.get('degree_track', '')
        if 'Minor' in track and 'Major' not in track or 'Pre-professional' in track:
            continue   # minors and pre-professional tracks aren't credentials on their own
        name = html.unescape(x['title']['rendered']).strip()
        level = t.get('degree_level', '')
        earn = mercer_earn(level)
        if earn == 'bachelor':
            length, bucket = 'About 4 years full time', '3plus'
        elif earn in ('certificate', 'gradcert'):
            length, bucket = 'Usually under a year', 'months'
        elif 'Doctoral' in level:
            length, bucket = '3 years or more', '3plus'
        elif 'Certificate' in level or 'Non-degree' in level:
            length, bucket = 'Usually under a year', 'months'
        else:
            length, bucket = 'About 1–2 years', '1to2'
        locations = [l.strip() for l in t.get('location', '').split(',') if l.strip()]
        rec = merged.setdefault(name, {
            'org': 'mercer', 'name': name, 'earn': earn, 'credential': level, 'length': length, 'bucket': bucket,
            'field': field_of(name), 'cost': 'Private tuition · financial aid available', 'campus': set(),
            'url': link if (link := (x.get('program_meta') or {}).get('program_link') or '').startswith('http') else x['link'],
            'options': [], 'online': False,
            'source': 'https://www.mercer.edu/academics/program-finder/',
        })
        rec['campus'].update(l for l in locations if l in ('Macon', 'Online'))
        rec['online'] = rec['online'] or 'Online' in locations
        rec['places'] = ['macon'] if 'Macon' in rec['campus'] else []
    out = []
    for rec in merged.values():
        rec['campus'] = ', '.join(sorted(rec['campus'])) or 'Macon'
        out.append(rec)
    return out


# ----- Hand-checked programs -----
def manual_programs():
    data = json.load(open(os.path.join(SOURCES, 'manual-programs.json'), encoding='utf-8'))
    out = []
    for p in data['programs']:
        rec = {**data['defaults'].get(p['org'], {}), **p}
        rec.setdefault('credential', {'bachelor': "Bachelor's degree"}.get(rec['earn'], ''))
        rec.setdefault('field', field_of(rec['name']))
        rec.setdefault('options', [])
        rec.setdefault('online', 'online' in rec.get('campus', '').lower())
        rec.setdefault('campus', '')
        rec.setdefault('source', rec['url'])
        rec.setdefault('places', ['macon'])
        out.append(rec)
    return out


def check_links(programs):
    """The inclusion rule: a program is listed only if its page is live. Drop any whose page is gone
    (404/410, or not a web address). Some schools refuse automated requests (403); those pages work in a
    browser, so they're kept."""
    import concurrent.futures
    import urllib.error

    def status(url):
        if not url.startswith('http'):
            return 'bad'
        for method in ('HEAD', 'GET'):
            try:
                return urllib.request.urlopen(urllib.request.Request(url, method=method, headers=UA), timeout=25).status
            except urllib.error.HTTPError as e:
                if method == 'GET' or e.code not in (405, 403):
                    return e.code
            except Exception:
                if method == 'GET':
                    return 'error'
    urls = sorted({p['url'] for p in programs})
    with concurrent.futures.ThreadPoolExecutor(12) as ex:
        codes = dict(zip(urls, ex.map(status, urls)))
    dead = {u for u, c in codes.items() if c in (404, 410, 'bad')}
    for p in programs:
        if p['url'] in dead:
            print(f"  left out, its page is gone: {p['name']} ({p['url']})")
    blocked = sum(1 for c in codes.values() if c == 403)
    print(f'Links: {len(urls)} checked, {len(dead)} gone, {blocked} refuse automated checks (kept)')
    return [p for p in programs if p['url'] not in dead]


def main():
    programs = []
    for name, build in (('Central Georgia Tech', cgtc_programs), ('Middle Georgia State', mga_programs),
                        ('Mercer', mercer_programs), ('Hand-checked', manual_programs)):
        found = build()
        print(f'{name}: {len(found)} programs')
        programs += found
    if '--no-links' not in sys.argv:
        programs = check_links(programs)
    ids = set()
    for p in programs:
        base = slug(f"{p['org']} {p['name']} {p['earn']}")
        pid, n = base, 2
        while pid in ids:
            pid, n = f'{base}-{n}', n + 1
        ids.add(pid)
        p['id'] = pid
        p['checked'] = TODAY
        p.setdefault('verify', False)
        p.setdefault('leadsTo', '')
    order = ['id', 'name', 'org', 'earn', 'credential', 'length', 'bucket', 'field', 'cost', 'campus', 'places', 'online',
             'options', 'leadsTo', 'url', 'source', 'verify', 'checked']
    programs = [{k: p.get(k) for k in order} for p in programs]
    json.dump({'built': TODAY, 'count': len(programs), 'programs': programs}, open(OUT, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    print(f'Wrote {len(programs)} programs to {os.path.relpath(OUT, ROOT)}')


if __name__ == '__main__':
    sys.exit(main())
