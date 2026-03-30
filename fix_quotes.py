import os, re

blog_dir = 'src/content/blog'
fixed = 0

for fname in sorted(os.listdir(blog_dir)):
    if not fname.endswith('.md'):
        continue
    fpath = os.path.join(blog_dir, fname)
    with open(fpath) as f:
        content = f.read()

    changed = False
    lines = content.split('\n')
    new_lines = []
    in_fm = False
    fm_count = 0

    for line in lines:
        if line.strip() == '---':
            fm_count += 1
            in_fm = (fm_count == 1)
            new_lines.append(line)
            continue

        if in_fm and fm_count == 1:
            for field in ['title', 'description', 'imageAlt']:
                prefix = field + ': '
                if line.startswith(prefix) and not line.startswith(prefix + '"') and not line.startswith(prefix + "'"):
                    val = line[len(prefix):]
                    if ':' in val:
                        val = val.replace('"', "'")
                        line = prefix + '"' + val + '"'
                        changed = True
                    break

            # Fix unquoted tags
            if line.startswith('tags: [') and '"' not in line:
                inner = line[7:].rstrip(']').rstrip()
                tags = [t.strip() for t in inner.split(',')]
                quoted = ', '.join('"' + t + '"' for t in tags if t)
                line = 'tags: [' + quoted + ']'
                changed = True

        new_lines.append(line)

    if changed:
        with open(fpath, 'w') as f:
            f.write('\n'.join(new_lines))
        fixed += 1

print(f'Fixed quotes in {fixed} files')
