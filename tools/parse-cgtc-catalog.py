#!/usr/bin/env python3
"""Read Central Georgia Tech's catalog PDF into tools/sources/cgtc-catalog.json:
every program's code, name, award, credit hours and "Location(s) Offered".

Needs pypdf (pip install pypdf). Usage, from the repo root:
    python3 tools/parse-cgtc-catalog.py path/to/catalog.pdf
The current catalog is https://www.centralgatech.edu/wp-content/uploads/pdfs/catalog/catalog.pdf
"""
import collections
import json
import os
import re
import sys

from pypdf import PdfReader

SITES = ['ATC/Middle GA Regional Airport', 'Warner Robins', 'Milledgeville', 'Macon', 'Online', 'Dual Enrollment',
         'GDC', 'YDC', 'VECTR', 'Putnam', 'Peach', 'Hawkinsville']


def main(pdf):
    text = '\n'.join((p.extract_text() or '') for p in PdfReader(pdf).pages)
    heads = list(re.finditer(r'\n([A-Z][A-Z0-9 /&\-–,\.\+\'’:]+?)\s*\n?\s*\(([A-Z]{1,3}[0-9]{1,2}|[A-Z]{3,4}[0-9]?)\)\s*\n\s*'
                             r'(Technical Certificate of Credit|Diploma|Associate Degree|Associate of [A-Za-z ]+)', text))
    out = []
    for k, m in enumerate(heads):
        body = text[m.end():heads[k + 1].start() if k + 1 < len(heads) else len(text)]
        loc = re.search(r'Location\(s\) Offered:\s*(.+?)(?:\n\s*Credit|\n\s*Hours|\n\s*[A-Z]{3,4} \d{4}|Competitive)', body, re.S)
        rest, sites = ' '.join(loc.group(1).split()) if loc else '', []
        for s in SITES:   # line breaks in the PDF run site names together, so pick out the known ones
            if s in rest:
                sites.append(s)
                rest = rest.replace(s, ' ')
        hours = re.findall(r'(?:Total|Minimum) (?:Credit )?Hours[^\d]{0,40}(\d{1,3})', body)
        out.append({'code': m.group(2), 'name': ' '.join(m.group(1).split()), 'award': m.group(3),
                    'sites': sites, 'hours': int(hours[0]) if hours else None})
    dest = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'sources', 'cgtc-catalog.json')
    json.dump({'source': 'https://www.centralgatech.edu/wp-content/uploads/pdfs/catalog/catalog.pdf', 'programs': out},
              open(dest, 'w'), indent=1)
    print(len(out), 'programs', dict(collections.Counter(o['award'] for o in out)))


if __name__ == '__main__':
    main(sys.argv[1])
