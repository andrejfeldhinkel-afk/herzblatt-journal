#!/usr/bin/env python3
import re
f = '/home/xy/Andrej/blog/astro.config.mjs'
c = open(f).read()
# Remove lines that filter out /tags/ and /tags
c = re.sub(r"\s*!page\.includes\('/tags/'\) &&", '', c)
c = re.sub(r"\s*!page\.includes\('/tags'\) &&", '', c)
open(f, 'w').write(c)
print('Sitemap filter updated - /tags/ pages now included')
