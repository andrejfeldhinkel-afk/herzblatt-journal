import re

# 1. Revert index.astro
with open('src/pages/index.astro') as f:
    content = f.read()

content = content.replace(
    'background: linear-gradient(to right, rgba(255,255,255,0.88) 0%, rgba(255,255,255,0.75) 55%, rgba(255,255,255,0.4) 100%);',
    'background: linear-gradient(to right, rgba(15,10,20,0.82) 0%, rgba(15,10,20,0.55) 55%, rgba(15,10,20,0.25) 100%);'
)
content = content.replace(
    'background: var(--color-primary-50); color: var(--color-primary-700); border: 1px solid var(--color-primary-200);',
    'background: rgba(255,255,255,0.15); color: white; border: 1px solid rgba(255,255,255,0.2); backdrop-filter: blur(8px);'
)
content = content.replace('animate-pulse bg-rose-500', 'animate-pulse bg-white')
content = content.replace(
    '" style="font-family: var(--font-serif); letter-spacing: -0.03em; color: var(--color-surface-900);">',
    'text-white" style="font-family: var(--font-serif); letter-spacing: -0.03em; text-shadow: 0 2px 20px rgba(0,0,0,0.3);">'
)
content = content.replace(
    'style="color: var(--color-surface-600);"',
    'style="color: rgba(255,255,255,0.85); text-shadow: 0 1px 8px rgba(0,0,0,0.2);"'
)
content = content.replace(
    'transition-all" style="border: 1px solid var(--color-primary-200); background: white; color: var(--color-primary-700);"',
    'transition-all text-white" style="border: 1px solid rgba(255,255,255,0.3); background: rgba(255,255,255,0.1); backdrop-filter: blur(8px);"'
)
content = content.replace('border-2 border-white"', 'border-2 border-white/50"')
content = content.replace(
    'text-sm font-semibold" style="color: var(--color-surface-900);',
    'text-sm font-semibold text-white"'
)
content = content.replace(
    'style="color: var(--color-surface-500);">vertrauen unseren Tipps',
    'style="color: rgba(255,255,255,0.7);">vertrauen unseren Tipps'
)

with open('src/pages/index.astro', 'w') as f:
    f.write(content)
print('index.astro reverted')

# 2. Revert BaseLayout
with open('src/layouts/BaseLayout.astro') as f:
    bl = f.read()

bl = bl.replace('// Always light mode', "const theme = localStorage.getItem('theme') || 'light';")
bl = bl.replace("document.documentElement.classList.remove('dark');", "document.documentElement.classList.toggle('dark', theme === 'dark');")

with open('src/layouts/BaseLayout.astro', 'w') as f:
    f.write(bl)
print('BaseLayout reverted')

# 3. Revert global.css
with open('src/styles/global.css') as f:
    css = f.read()

dark_block = """:root.dark {
  --bg: var(--color-surface-950);
  --bg-card: var(--color-surface-900);
  --bg-soft: var(--color-surface-800);
  --text: var(--color-surface-100);
  --text-muted: var(--color-surface-400);
  --border: var(--color-surface-700);
  --code-bg: var(--color-surface-800);
  --color-primary-50: rgba(244, 63, 94, 0.08);
  --color-primary-100: rgba(244, 63, 94, 0.15);
  --color-primary-200: rgba(244, 63, 94, 0.25);
}
"""

if ':root.dark' not in css:
    css = css.replace('\nbody {', '\n' + dark_block + '\nbody {')

if '.dark .prose h2' not in css:
    dark_prose = """.dark .prose h2 { border-bottom-color: var(--color-surface-700); }
.dark .prose a { color: var(--color-primary-400); }
.dark .prose blockquote { background: var(--color-surface-800); }
.dark .prose tbody tr:hover { background: var(--color-surface-800); }
.dark .glass { background: rgba(12, 10, 9, 0.8); }
"""
    css = css.replace('.animate-float', dark_prose + '\n.animate-float')

with open('src/styles/global.css', 'w') as f:
    f.write(css)
print('global.css reverted')
print('DONE - all reverted')
