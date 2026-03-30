#!/usr/bin/env python3
"""
Add 301 redirects for all 404 tag pages to /tags/ overview page.
These are old tags that were consolidated to 39 core tags.
Also add the one blog redirect that's 404ing.
"""
import re

SERVER_FILE = "/home/xy/Andrej/blog/server.mjs"

# All 404 tag URLs from Search Console
OLD_TAGS = [
    "Interkulturell", "Freiheit", "dopamine", "Geldmanagement",
    "Komplimente", "Profilfotos", "Unterschiede", "Beziehungskommunikation",
    "Mythen", "Quality Time", "Style", "Achtsamkeit", "Ghosting",
    "App-Test", "Karriere", "Konversation", "Typen", "Dating Dresden",
    "Paar-Planung", "beziehungszyklus", "Toxische Beziehung", "SMS",
    "Recovery", "Dating Stuttgart", "Glück", "WhatsMeet", "Rizz",
    "Gesprächsstarter", "Dating-Trends", "Maenner", "Mentale Gesundheit",
    "Fotos", "Herzschmerz", "Ideen", "Effizienz", "Bucket List",
    "Erste-Nachricht", "Angst", "Dating mit Kind", "Selbstakzeptanz",
    "Dating Düsseldorf", "Frau", "jahreszeiten beziehung",
    "phasen beziehung", "Interkulturell", "Wellness", "Profiloptimierung",
    "Timeline", "Safety", "Körperliche Nähe", "Senior Dating",
    "Prozess", "Paar", "Erfolg", "Geheimnis"
]

# Read server.mjs
with open(SERVER_FILE, 'r') as f:
    content = f.read()

# Find the redirects object in server.mjs
# We need to add tag redirects to the redirect map
# The server.mjs uses a redirectMap or similar pattern

# Build redirect rules for insertion
# These will be handled in the server.mjs redirect logic
redirects = []
seen = set()
for tag in OLD_TAGS:
    # Normalize - some have trailing slash, some don't
    tag_clean = tag.strip()
    if tag_clean.lower() in seen:
        continue
    seen.add(tag_clean.lower())

    # URL-encode spaces for the path
    tag_path = tag_clean.replace(' ', '%20')
    tag_path_space = tag_clean

    # Add both with and without trailing slash
    redirects.append(f"    '/tags/{tag_path}': '/tags/',")
    redirects.append(f"    '/tags/{tag_path}/': '/tags/',")
    if ' ' in tag_clean:
        # Also add the space version
        redirects.append(f"    '/tags/{tag_path_space}': '/tags/',")
        redirects.append(f"    '/tags/{tag_path_space}/': '/tags/',")

# Also add the blog redirect
redirects.append("    '/blog/dating-introvertiert-extrovertiert-paar/': '/blog/dating-introvertiert-extrovertiert-paar-guide/',")

print(f"Generated {len(redirects)} redirect rules for {len(seen)} unique old tags + 1 blog redirect")
print("\nRedirects to add:")
for r in redirects[:10]:
    print(r)
print(f"... and {len(redirects)-10} more")

# Now we need to add these to server.mjs
# Check if there's already a redirectMap
if 'const tagRedirects' in content:
    print("\nTag redirects already exist in server.mjs - skipping")
else:
    # Add a tagRedirects map and integrate it into the request handler
    tag_redirect_block = "const tagRedirects = {\n" + "\n".join(redirects) + "\n};\n"

    # Find where to insert - before the server creation
    # Look for the http.createServer line
    insert_marker = "const server = http.createServer"
    if insert_marker in content:
        content = content.replace(insert_marker, tag_redirect_block + "\n" + insert_marker)

        # Now add the redirect check in the request handler
        # Find the handler function and add tag redirect check
        # Look for where redirectMap is checked or where handler(req, res) is called
        if 'handler(req, res)' in content:
            old_handler = "handler(req, res)"
            new_handler = """// Check tag redirects
    const tagDest = tagRedirects[parsedUrl.pathname] || tagRedirects[decodeURIComponent(parsedUrl.pathname)];
    if (tagDest) {
      res.writeHead(301, { 'Location': tagDest });
      res.end();
      return;
    }
    handler(req, res)"""
            content = content.replace(old_handler, new_handler, 1)

        with open(SERVER_FILE, 'w') as f:
            f.write(content)
        print("\nSuccessfully added tag redirects to server.mjs")
    else:
        print(f"\nCouldn't find '{insert_marker}' in server.mjs")
